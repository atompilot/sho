package service

import (
	"context"
	"errors"
	"fmt"
	"math/rand"

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
	Slug           *string // nil = auto-generate
}

type UpdatePostInput struct {
	Slug       string
	Content    string
	Credential string
	EditedBy   string
}

func (s *PostService) CreatePost(ctx context.Context, input CreatePostInput) (*model.PublishResponse, error) {
	slug, err := s.resolveSlug(ctx, input.Slug)
	if err != nil {
		return nil, err
	}

	editToken, err := policy.GenerateToken(32)
	if err != nil {
		return nil, fmt.Errorf("generate edit token: %w", err)
	}

	post := &model.Post{
		ID:             uuid.New(),
		Slug:           slug,
		Title:          input.Title,
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
		ManageURL: fmt.Sprintf("/manage/%s?token=%s", slug, editToken),
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
		return err
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

	return s.store.Update(ctx, input.Slug, input.Content)
}

func (s *PostService) DeletePost(ctx context.Context, slug string, editToken string) error {
	post, err := s.store.GetBySlug(ctx, slug)
	if err != nil {
		return err
	}
	if post.EditToken != editToken {
		return policy.ErrInvalidCredential
	}
	return s.store.SoftDelete(ctx, slug)
}

func (s *PostService) ListPosts(ctx context.Context, limit, offset int) ([]*model.Post, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	return s.store.ListRecent(ctx, limit, offset)
}

const slugChars = "abcdefghijklmnopqrstuvwxyz0123456789"

func (s *PostService) resolveSlug(ctx context.Context, requested *string) (string, error) {
	if requested != nil && *requested != "" {
		exists, err := s.store.SlugExists(ctx, *requested)
		if err != nil {
			return "", err
		}
		if exists {
			return "", errors.New("slug already taken")
		}
		return *requested, nil
	}
	for range 5 {
		b := make([]byte, 8)
		for i := range b {
			b[i] = slugChars[rand.Intn(len(slugChars))]
		}
		slug := string(b)
		exists, err := s.store.SlugExists(ctx, slug)
		if err != nil {
			return "", err
		}
		if !exists {
			return slug, nil
		}
	}
	return "", errors.New("failed to generate unique slug")
}
