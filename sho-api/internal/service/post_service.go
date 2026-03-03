package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/atompilot/sho-api/internal/llm"
	"github.com/atompilot/sho-api/internal/model"
	"github.com/atompilot/sho-api/internal/policy"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/google/uuid"
)

var defaultAIReviewPrompt = func() string {
	if v := os.Getenv("DEFAULT_AI_REVIEW_PROMPT"); v != "" {
		return v
	}
	return "You are an edit reviewer for a published post. Evaluate whether the proposed edit is constructive and appropriate. " +
		"Accept edits that fix typos, improve clarity, add useful information, or make reasonable updates. " +
		"Reject edits that are spam, vandalism, off-topic, or destructive. " +
		"Your response MUST start with the word APPROVE or REJECT (nothing before it), followed by a brief reason."
}()

var defaultAIQAPrompt = func() string {
	if v := os.Getenv("DEFAULT_AI_QA_PROMPT"); v != "" {
		return v
	}
	return "You are a gatekeeper for content access. Evaluate whether the user's answer demonstrates genuine understanding or knowledge. " +
		"Be reasonably lenient — accept answers that are roughly correct, use synonyms, or show clear understanding even if not word-perfect. " +
		"Reply with exactly YES or NO."
}()

// ErrEmptyContent is returned when the submitted content is blank after trimming.
var ErrEmptyContent = errors.New("content is required")

// ErrDuplicateContent is returned when the submitted content already exists.
type ErrDuplicateContent struct {
	Slug string // slug of the existing post
}

func (e ErrDuplicateContent) Error() string {
	return fmt.Sprintf("content already published as /%s", e.Slug)
}

type PostService struct {
	store          *store.PostStore
	channelStore   *store.ChannelStore
	masterPassword string
}

func NewPostService(s *store.PostStore, masterPassword string) *PostService {
	return &PostService{store: s, masterPassword: masterPassword}
}

func (s *PostService) SetChannelStore(cs *store.ChannelStore) {
	s.channelStore = cs
}

type CreatePostInput struct {
	Title          *string
	Content        string
	Format         model.Format
	Policy         model.Policy
	Password       *string
	AIReviewPrompt *string
	ViewPolicy     model.ViewPolicy
	ViewPassword   *string
	ViewQAQuestion *string
	ViewQAPrompt   *string
	ViewQAAnswer   *string
	Unlisted       bool
	Author         *string
	AgentID        *string
	AgentName      *string
	WebhookURL     *string
	Channel        *string // channel name; resolved to channel_id before persistence
}

type UpdatePostInput struct {
	Slug       string
	Content    string
	Title      *string
	Credential string
	EditedBy   string
}

var slugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$|^[a-z0-9]{1,64}$`)

func (s *PostService) CreatePost(ctx context.Context, input CreatePostInput) (*model.PublishResponse, error) {
	// Trim only trailing whitespace (leading whitespace is intentional).
	input.Content = strings.TrimRight(input.Content, " \t\r\n")
	if input.Content == "" {
		return nil, ErrEmptyContent
	}

	// Reject duplicate title+content — return the existing post's slug.
	existingSlug, err := s.store.FindByTitleAndContent(ctx, input.Title, input.Content)
	if err != nil {
		return nil, fmt.Errorf("check duplicate: %w", err)
	}
	if existingSlug != "" {
		return nil, ErrDuplicateContent{Slug: existingSlug}
	}

	// Edit policy password: auto-generate 6-digit if empty
	var rawEditPassword *string
	if input.Policy == model.PolicyPassword {
		if input.Password == nil || *input.Password == "" {
			pw := generateNumericCode(6)
			input.Password = &pw
		}
		rawEditPassword = input.Password
	}

	// Default view policy to open
	if input.ViewPolicy == "" {
		input.ViewPolicy = model.ViewPolicyOpen
	}

	// Validate view policy required fields
	if input.ViewPolicy == model.ViewPolicyHumanQA {
		if input.ViewQAQuestion == nil || strings.TrimSpace(*input.ViewQAQuestion) == "" {
			return nil, errors.New("question is required for human-qa view policy")
		}
		if input.ViewQAAnswer == nil || strings.TrimSpace(*input.ViewQAAnswer) == "" {
			return nil, errors.New("answer is required for human-qa view policy")
		}
	}
	if input.ViewPolicy == model.ViewPolicyAIQA {
		if input.ViewQAQuestion == nil || strings.TrimSpace(*input.ViewQAQuestion) == "" {
			return nil, errors.New("question is required for ai-qa view policy")
		}
	}

	// View policy password: auto-generate 6-digit if empty
	var rawViewPassword *string
	if input.ViewPolicy == model.ViewPolicyPassword {
		if input.ViewPassword == nil || *input.ViewPassword == "" {
			pw := generateNumericCode(6)
			input.ViewPassword = &pw
		}
		rawViewPassword = input.ViewPassword
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

	// Resolve channel name to channel ID if provided.
	var channelID *uuid.UUID
	if input.Channel != nil && *input.Channel != "" && s.channelStore != nil {
		ch, err := s.channelStore.GetByName(ctx, *input.Channel)
		if err != nil {
			return nil, fmt.Errorf("channel %q not found", *input.Channel)
		}
		channelID = &ch.ID
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
		ViewPolicy:     input.ViewPolicy,
		ViewQAQuestion: input.ViewQAQuestion,
		ViewQAPrompt:   input.ViewQAPrompt,
		ViewQAAnswer:   input.ViewQAAnswer,
		Unlisted:       input.Unlisted,
		Author:         input.Author,
		AgentID:        input.AgentID,
		AgentName:      input.AgentName,
		ChannelID:      channelID,
	}

	if input.Policy == model.PolicyPassword && input.Password != nil {
		hash, err := policy.HashPassword(*input.Password)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		post.Password = &hash
	}

	// Store view password as plaintext (6-digit numeric code)
	if input.ViewPolicy == model.ViewPolicyPassword && input.ViewPassword != nil {
		post.ViewPassword = input.ViewPassword
	}

	if err := s.store.Create(ctx, post); err != nil {
		return nil, fmt.Errorf("create post: %w", err)
	}

	return &model.PublishResponse{
		ID:           post.ID,
		Slug:         slug,
		Title:        title,
		EditPassword: rawEditPassword,
		ViewPassword: rawViewPassword,
		CreatedAt:    post.CreatedAt,
	}, nil
}

func (s *PostService) GetPost(ctx context.Context, slug string) (*model.Post, error) {
	return s.store.GetBySlug(ctx, slug)
}

// RecordView tracks a deduplicated view for the given fingerprint (24 h window).
// Returns the current view count and whether this visit was counted as a new view.
func (s *PostService) RecordView(ctx context.Context, slug, fpHash string) (views int, counted bool, err error) {
	return s.store.TryView(ctx, slug, fpHash)
}

// ErrAIReviewRejected is returned when the AI reviewer rejects an edit.
type ErrAIReviewRejected struct {
	Reason string
}

func (e ErrAIReviewRejected) Error() string {
	return fmt.Sprintf("edit rejected by AI reviewer: %s", e.Reason)
}

func (s *PostService) UpdatePost(ctx context.Context, input UpdatePostInput, llmClient LLMChatter) error {
	post, err := s.store.GetBySlug(ctx, input.Slug)
	if err != nil {
		return fmt.Errorf("get post: %w", err)
	}

	// Master password bypasses all policy checks.
	if !policy.CheckMasterPassword(s.masterPassword, input.Credential) {
		if post.Policy == model.PolicyAIReview {
			if err := s.verifyAIReview(ctx, llmClient, post, input.Content); err != nil {
				return err
			}
		} else {
			stored := post.Password
			if post.Policy == model.PolicyOwnerOnly {
				stored = &post.EditToken
			}
			if err := policy.CheckUpdate(post.Policy, stored, input.Credential); err != nil {
				return err
			}
		}
	}

	if err := s.store.SaveVersion(ctx, post.ID, post.Content, input.EditedBy); err != nil {
		return fmt.Errorf("save version: %w", err)
	}

	// Use explicit title if provided; otherwise re-extract from content.
	var title *string
	if input.Title != nil {
		title = input.Title
	} else if t := extractTitle(input.Content, post.Format); t != "" {
		title = &t
	}

	return s.store.Update(ctx, input.Slug, input.Content, title)
}

// verifyAIReview calls the LLM to evaluate whether the proposed edit should be accepted.
func (s *PostService) verifyAIReview(ctx context.Context, client LLMChatter, post *model.Post, newContent string) error {
	if client == nil {
		return errors.New("AI review is temporarily unavailable")
	}

	reviewPrompt := defaultAIReviewPrompt
	if post.AIReviewPrompt != nil && strings.TrimSpace(*post.AIReviewPrompt) != "" {
		reviewPrompt = *post.AIReviewPrompt
	}

	prompt := fmt.Sprintf(
		"%s\n\n--- ORIGINAL CONTENT ---\n%s\n\n--- PROPOSED EDIT ---\n%s",
		reviewPrompt, truncateForReview(post.Content, 2000), truncateForReview(newContent, 2000),
	)

	resp, err := client.Chat(ctx, []llm.Message{
		{Role: "user", Content: prompt},
	})
	if err != nil {
		return fmt.Errorf("AI review failed: %w", err)
	}

	verdict := strings.TrimSpace(resp)
	upper := strings.ToUpper(verdict)

	// Strip markdown headers and leading punctuation for robust parsing.
	cleaned := strings.TrimLeft(upper, "#* \t")

	if strings.HasPrefix(cleaned, "APPROVE") {
		return nil
	}
	// Also accept "APPROVED" as approval.
	if strings.HasPrefix(cleaned, "APPROVED") {
		return nil
	}

	reason := verdict
	if strings.HasPrefix(cleaned, "REJECT") {
		// Extract reason after REJECT/REJECTED keyword
		idx := strings.Index(upper, "REJECT")
		after := verdict[idx+len("REJECT"):]
		after = strings.TrimLeft(after, "ED") // handle REJECTED
		reason = strings.TrimSpace(after)
		reason = strings.TrimLeft(reason, ":.- ")
		if reason == "" {
			reason = "edit was not approved"
		}
	}
	return ErrAIReviewRejected{Reason: reason}
}

// truncateForReview limits content sent to the LLM for review.
func truncateForReview(content string, maxRunes int) string {
	runes := []rune(content)
	if len(runes) <= maxRunes {
		return content
	}
	return string(runes[:maxRunes]) + "\n... (truncated)"
}

func (s *PostService) DeletePost(ctx context.Context, slug string, credential string) error {
	post, err := s.store.GetBySlug(ctx, slug)
	if err != nil {
		return fmt.Errorf("get post: %w", err)
	}

	// Master password bypasses all policy checks.
	if !policy.CheckMasterPassword(s.masterPassword, credential) {
		// Accept edit_token directly (backwards compat).
		if !policy.ConstantTimeEqual(post.EditToken, credential) {
			stored := post.Password
			if post.Policy == model.PolicyOwnerOnly {
				stored = &post.EditToken
			}
			if err := policy.CheckUpdate(post.Policy, stored, credential); err != nil {
				return err
			}
		}
	}

	return s.store.SoftDelete(ctx, slug)
}

func (s *PostService) ListPosts(ctx context.Context, limit, offset int, format string) ([]*model.Post, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.store.ListRecent(ctx, limit, offset, format)
}

func (s *PostService) ListRecommended(ctx context.Context, limit, offset int, format string) ([]*model.Post, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	// Store fetches limit*3+30 rows so we have enough to apply diversity re-ranking.
	posts, err := s.store.ListRecommended(ctx, limit, offset, format)
	if err != nil {
		return nil, err
	}
	return applyFormatDiversity(posts, limit), nil
}

// applyFormatDiversity re-ranks posts to ensure adjacent items have different formats.
// Algorithm: greedy scan — for each slot, prefer the highest-scored post whose format
// has not appeared in the previous two positions.  If no diverse post exists, fall back
// to the best available.
//
// Input must already be sorted descending by recommendation score (as returned by the DB).
func applyFormatDiversity(posts []*model.Post, limit int) []*model.Post {
	if len(posts) == 0 {
		return posts
	}

	used := make([]bool, len(posts))
	result := make([]*model.Post, 0, limit)

	for len(result) < limit {
		// Collect the formats of the last two chosen posts.
		recentFmts := map[model.Format]bool{}
		if n := len(result); n >= 1 {
			recentFmts[result[n-1].Format] = true
		}
		if n := len(result); n >= 2 {
			recentFmts[result[n-2].Format] = true
		}

		diverse, fallback := -1, -1
		for i, p := range posts {
			if used[i] {
				continue
			}
			if fallback == -1 {
				fallback = i // best un-used post (score order preserved)
			}
			if !recentFmts[p.Format] && diverse == -1 {
				diverse = i // first un-used post with a fresh format
			}
			if diverse != -1 {
				break
			}
		}

		chosen := diverse
		if chosen == -1 {
			chosen = fallback
		}
		if chosen == -1 {
			break // exhausted
		}

		used[chosen] = true
		result = append(result, posts[chosen])
	}

	return result
}

func (s *PostService) ListByAgent(ctx context.Context, agentID string, limit, offset int) ([]*model.Post, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.store.ListByAgent(ctx, agentID, limit, offset)
}

func (s *PostService) SearchPosts(ctx context.Context, query string, limit, offset int, format string) ([]*model.Post, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if query == "" {
		return s.store.ListRecent(ctx, limit, offset, format)
	}
	return s.store.Search(ctx, query, limit, offset, format)
}

// --- Random Author Generation ------------------------------------------------

var authorAdjectives = []string{
	"Cosmic", "Silent", "Brave", "Swift", "Golden",
	"Amber", "Neon", "Lunar", "Solar", "Vivid",
	"Crystal", "Shadow", "Stellar", "Frost", "Ember",
	"Velvet", "Crimson", "Azure", "Jade", "Silver",
	"Mystic", "Radiant", "Arctic", "Blazing", "Gentle",
	"Noble", "Rustic", "Bright", "Quiet", "Wild",
	"Serene", "Bold", "Misty", "Stormy", "Dusk",
	"Dawn", "Iron", "Coral", "Maple", "Thunder",
	"Ocean", "Pixel", "Prism", "Nimble", "Marble",
	"Hollow", "Rapid", "Astral", "Moss", "Silk",
}

var authorNouns = []string{
	"Panda", "Phoenix", "Fox", "Owl", "Wolf",
	"Falcon", "Dolphin", "Tiger", "Eagle", "Raven",
	"Otter", "Lynx", "Crane", "Hawk", "Bear",
	"Heron", "Mantis", "Gecko", "Parrot", "Shark",
	"Moth", "Coral", "Bison", "Coyote", "Jaguar",
	"Puma", "Robin", "Finch", "Badger", "Viper",
	"Swan", "Stag", "Elk", "Hare", "Wasp",
	"Newt", "Wren", "Lark", "Ibis", "Kite",
	"Toad", "Crab", "Mole", "Seal", "Dove",
	"Frog", "Goat", "Bat", "Bee", "Ant",
}

// GenerateRandomAuthor creates a random "Adjective Noun" author name,
// checking against existing authors to avoid duplicates (max 5 retries).
func (s *PostService) GenerateRandomAuthor(ctx context.Context) (string, error) {
	existing, err := s.store.ListDistinctAuthors(ctx)
	if err != nil {
		return "", fmt.Errorf("list authors: %w", err)
	}
	taken := make(map[string]bool, len(existing))
	for _, a := range existing {
		taken[a] = true
	}

	buf := make([]byte, 2)
	var last string
	for range 5 {
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		adj := authorAdjectives[int(buf[0])%len(authorAdjectives)]
		noun := authorNouns[int(buf[1])%len(authorNouns)]
		last = adj + " " + noun
		if !taken[last] {
			return last, nil
		}
	}
	// All attempts collided — return the last generated name anyway
	return last, nil
}

func (s *PostService) LikePost(ctx context.Context, slug, fpHash string) (int, bool, error) {
	return s.store.TryLike(ctx, slug, fpHash)
}

func (s *PostService) SharePost(ctx context.Context, slug, fpHash string) (int, bool, error) {
	return s.store.TryShare(ctx, slug, fpHash)
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

func (s *PostService) ListVersions(ctx context.Context, slug string, limit int) ([]*model.PostVersion, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	post, err := s.store.GetBySlug(ctx, slug)
	if err != nil {
		return nil, 0, err
	}
	versions, err := s.store.ListVersions(ctx, post.ID, limit)
	if err != nil {
		return nil, 0, err
	}
	return versions, post.VersionCount, nil
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

func generateNumericCode(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		// Fallback — should never happen
		return strings.Repeat("0", n)
	}
	for i, byt := range b {
		b[i] = '0' + byt%10
	}
	return string(b)
}

// VerifyViewResult holds the result of a view verification attempt.
type VerifyViewResult struct {
	Granted bool   `json:"granted"`
	Content string `json:"content,omitempty"`
	Error   string `json:"error,omitempty"`
}

// VerifyView checks a credential against the post's view policy and returns the full content if valid.
func (s *PostService) VerifyView(ctx context.Context, slug, credential string, llmClient LLMChatter) (*VerifyViewResult, error) {
	post, err := s.store.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}

	// Master password bypasses all view policy checks.
	if policy.CheckMasterPassword(s.masterPassword, credential) {
		return &VerifyViewResult{Granted: true, Content: post.Content}, nil
	}

	switch post.ViewPolicy {
	case model.ViewPolicyOpen:
		return &VerifyViewResult{Granted: true, Content: post.Content}, nil

	case model.ViewPolicyPassword:
		if post.ViewPassword != nil && *post.ViewPassword == credential {
			return &VerifyViewResult{Granted: true, Content: post.Content}, nil
		}
		return &VerifyViewResult{Granted: false, Error: "incorrect password"}, nil

	case model.ViewPolicyHumanQA:
		if post.ViewQAAnswer == nil {
			return &VerifyViewResult{Granted: false, Error: "no answer configured"}, nil
		}
		if strings.EqualFold(strings.TrimSpace(credential), strings.TrimSpace(*post.ViewQAAnswer)) {
			return &VerifyViewResult{Granted: true, Content: post.Content}, nil
		}
		return &VerifyViewResult{Granted: false, Error: "incorrect answer"}, nil

	case model.ViewPolicyAIQA:
		if llmClient == nil {
			return &VerifyViewResult{Granted: false, Error: "AI verification is temporarily unavailable"}, nil
		}
		question := ""
		if post.ViewQAQuestion != nil {
			question = *post.ViewQAQuestion
		}
		var customPrompt string
		if post.ViewQAPrompt != nil {
			customPrompt = *post.ViewQAPrompt
		}
		granted, err := verifyAIQA(ctx, llmClient, question, credential, customPrompt)
		if err != nil {
			return &VerifyViewResult{Granted: false, Error: "AI verification failed, please try again"}, nil
		}
		if granted {
			return &VerifyViewResult{Granted: true, Content: post.Content}, nil
		}
		return &VerifyViewResult{Granted: false, Error: "AI determined your answer is incorrect"}, nil
	}

	return &VerifyViewResult{Granted: false, Error: "unknown view policy"}, nil
}

// LLMChatter is a minimal interface for AI QA verification.
type LLMChatter interface {
	Chat(ctx context.Context, messages []llm.Message) (string, error)
}

func verifyAIQA(ctx context.Context, client LLMChatter, question, answer, customPrompt string) (bool, error) {
	systemPrompt := defaultAIQAPrompt
	if strings.TrimSpace(customPrompt) != "" {
		systemPrompt = customPrompt
	}

	prompt := fmt.Sprintf(
		"%s\n\nThe question is: %q\nThe user answered: %q\n\nReply with exactly YES or NO.",
		systemPrompt, question, answer,
	)
	resp, err := client.Chat(ctx, []llm.Message{
		{Role: "user", Content: prompt},
	})
	if err != nil {
		return false, err
	}
	verdict := strings.ToUpper(strings.TrimSpace(resp))
	// Only accept exact YES (possibly with punctuation like "YES." or "YES!")
	verdict = strings.TrimRight(verdict, ".!,;")
	return verdict == "YES", nil
}
