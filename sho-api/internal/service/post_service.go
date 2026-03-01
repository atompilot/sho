package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"regexp"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/policy"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/google/uuid"
)

type PostService struct {
	store *store.PostStore
}

func NewPostService(s *store.PostStore) *PostService {
	return &PostService{store: s}
}

type CreatePostInput struct {
	Title          *string
	Content        string
	Format         model.Format
	Policy         model.Policy
	Password       *string
	AIReviewPrompt *string
}

type UpdatePostInput struct {
	Slug       string
	Content    string
	Credential string
	EditedBy   string
}

var slugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$|^[a-z0-9]{1,64}$`)

func (s *PostService) CreatePost(ctx context.Context, input CreatePostInput) (*model.PublishResponse, error) {
	// Validate password required for password policy
	if input.Policy == model.PolicyPassword {
		if input.Password == nil || *input.Password == "" {
			return nil, errors.New("password is required for password policy")
		}
	}

	slug, err := s.resolveSlug(ctx, nil)
	if err != nil {
		return nil, err
	}

	editToken, err := policy.GenerateToken(32)
	if err != nil {
		return nil, fmt.Errorf("generate edit token: %w", err)
	}

	// Auto-extract title from content when not explicitly provided.
	title := input.Title
	if title == nil {
		if t := extractTitle(input.Content, input.Format); t != "" {
			title = &t
		}
	}

	post := &model.Post{
		ID:             uuid.New(),
		Slug:           slug,
		Title:          title,
		Content:        input.Content,
		Format:         input.Format,
		Policy:         input.Policy,
		AIReviewPrompt: input.AIReviewPrompt,
		EditToken:      editToken,
	}

	if input.Policy == model.PolicyPassword && input.Password != nil {
		hash, err := policy.HashPassword(*input.Password)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		post.Password = &hash
	}

	if err := s.store.Create(ctx, post); err != nil {
		return nil, fmt.Errorf("create post: %w", err)
	}

	return &model.PublishResponse{
		ID:        post.ID,
		Slug:      slug,
		EditToken: editToken,
		ManageURL: fmt.Sprintf("/manage/%s", slug),
		CreatedAt: post.CreatedAt,
	}, nil
}

func (s *PostService) GetPost(ctx context.Context, slug string) (*model.Post, error) {
	post, err := s.store.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	s.store.IncrViews(ctx, slug)
	return post, nil
}

func (s *PostService) UpdatePost(ctx context.Context, input UpdatePostInput) error {
	post, err := s.store.GetBySlug(ctx, input.Slug)
	if err != nil {
		return fmt.Errorf("get post: %w", err)
	}

	if post.Policy != model.PolicyAIReview {
		stored := post.Password
		if post.Policy == model.PolicyOwnerOnly {
			stored = &post.EditToken
		}
		if err := policy.CheckUpdate(post.Policy, stored, input.Credential); err != nil {
			return err
		}
	}

	if err := s.store.SaveVersion(ctx, post.ID, post.Content, input.EditedBy); err != nil {
		return fmt.Errorf("save version: %w", err)
	}

	// Re-extract title from new content.
	var title *string
	if t := extractTitle(input.Content, post.Format); t != "" {
		title = &t
	}

	return s.store.Update(ctx, input.Slug, input.Content, title)
}

func (s *PostService) DeletePost(ctx context.Context, slug string, editToken string) error {
	post, err := s.store.GetBySlug(ctx, slug)
	if err != nil {
		return fmt.Errorf("get post: %w", err)
	}
	if !policy.ConstantTimeEqual(post.EditToken, editToken) {
		return policy.ErrInvalidCredential
	}
	return s.store.SoftDelete(ctx, slug)
}

func (s *PostService) ListPosts(ctx context.Context, limit, offset int) ([]*model.Post, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.store.ListRecent(ctx, limit, offset)
}

func (s *PostService) SearchPosts(ctx context.Context, query string, limit, offset int) ([]*model.Post, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if query == "" {
		return s.store.ListRecent(ctx, limit, offset)
	}
	return s.store.Search(ctx, query, limit, offset)
}

func (s *PostService) LikePost(ctx context.Context, slug, fpHash string) (int, bool, error) {
	return s.store.TryLike(ctx, slug, fpHash)
}

// ErrEmptyComment is returned when comment content is empty.
var ErrEmptyComment = errors.New("comment content is required")

// ErrParentNotBelongToPost is returned when parent comment belongs to a different post.
var ErrParentNotBelongToPost = errors.New("parent comment does not belong to this post")

// ErrParentCommentNotFound is returned when the specified parent comment does not exist.
var ErrParentCommentNotFound = errors.New("parent comment not found")

func (s *PostService) AddComment(ctx context.Context, slug, content string, parentID *uuid.UUID) (*model.Comment, error) {
	if content == "" {
		return nil, ErrEmptyComment
	}
	post, err := s.store.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}

	// Normalize parentID to ensure max 2 levels of nesting.
	if parentID != nil {
		parent, err := s.store.GetComment(ctx, *parentID)
		if err != nil {
			return nil, ErrParentCommentNotFound
		}
		if parent.PostID != post.ID {
			return nil, ErrParentNotBelongToPost
		}
		// If parent is already a reply (level 2), normalize to its parent (level 1).
		if parent.ParentID != nil {
			parentID = parent.ParentID
		}
	}

	return s.store.CreateComment(ctx, post.ID, parentID, content)
}

func (s *PostService) ListComments(ctx context.Context, slug string) ([]*model.Comment, error) {
	// Verify post exists before returning comments.
	if _, err := s.store.GetBySlug(ctx, slug); err != nil {
		return nil, err
	}
	return s.store.GetComments(ctx, slug, 200)
}

const slugChars = "abcdefghijklmnopqrstuvwxyz0123456789"

func (s *PostService) resolveSlug(ctx context.Context, requested *string) (string, error) {
	if requested != nil && *requested != "" {
		slug := *requested
		if !slugRegex.MatchString(slug) {
			return "", errors.New("slug must be 3-64 characters, lowercase alphanumeric and hyphens only, cannot start or end with hyphen")
		}
		exists, err := s.store.SlugExists(ctx, slug)
		if err != nil {
			return "", fmt.Errorf("check slug: %w", err)
		}
		if exists {
			return "", errors.New("slug already taken")
		}
		return slug, nil
	}
	for range 5 {
		slug, err := generateRandomSlug(8)
		if err != nil {
			return "", fmt.Errorf("generate slug: %w", err)
		}
		exists, err := s.store.SlugExists(ctx, slug)
		if err != nil {
			return "", fmt.Errorf("check slug: %w", err)
		}
		if !exists {
			return slug, nil
		}
	}
	return "", errors.New("failed to generate unique slug")
}

func generateRandomSlug(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	result := make([]byte, n)
	for i, byt := range b {
		result[i] = slugChars[int(byt)%len(slugChars)]
	}
	return string(result), nil
}
