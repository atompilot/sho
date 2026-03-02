package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("post not found")

type PostStore struct {
	pool *pgxpool.Pool
}

func NewPostStore(pool *pgxpool.Pool) *PostStore {
	return &PostStore{pool: pool}
}

func (s *PostStore) Create(ctx context.Context, p *model.Post) error {
	p.ContentLength = len(p.Content) // byte length, sufficient for scoring
	_, err := s.pool.Exec(ctx, `
		INSERT INTO sho_posts (id, slug, title, content, content_length, format, policy, password, ai_review_prompt, edit_token,
		                   view_policy, view_password, view_qa_question, view_qa_prompt, view_qa_answer, unlisted,
		                   agent_id, agent_name, channel_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
	`, p.ID, p.Slug, p.Title, p.Content, p.ContentLength, p.Format, p.Policy, p.Password, p.AIReviewPrompt, p.EditToken,
		p.ViewPolicy, p.ViewPassword, p.ViewQAQuestion, p.ViewQAPrompt, p.ViewQAAnswer, p.Unlisted,
		p.AgentID, p.AgentName, p.ChannelID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return errors.New("slug already taken")
		}
		return fmt.Errorf("insert post: %w", err)
	}
	return nil
}

func (s *PostStore) GetBySlug(ctx context.Context, slug string) (*model.Post, error) {
	p := &model.Post{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, slug, title, ai_title, content, format, policy, password, ai_review_prompt, edit_token,
		       view_policy, view_password, view_qa_question, view_qa_prompt, view_qa_answer, unlisted,
		       agent_id, agent_name,
		       views, likes, shares, last_viewed_at, created_at, updated_at,
		       (SELECT COUNT(*) FROM sho_post_versions WHERE post_id = sho_posts.id) AS version_count
		FROM sho_posts WHERE slug = $1 AND deleted_at IS NULL
	`, slug).Scan(
		&p.ID, &p.Slug, &p.Title, &p.AITitle, &p.Content, &p.Format, &p.Policy,
		&p.Password, &p.AIReviewPrompt, &p.EditToken,
		&p.ViewPolicy, &p.ViewPassword, &p.ViewQAQuestion, &p.ViewQAPrompt, &p.ViewQAAnswer, &p.Unlisted,
		&p.AgentID, &p.AgentName,
		&p.Views, &p.Likes, &p.Shares, &p.LastViewedAt, &p.CreatedAt, &p.UpdatedAt,
		&p.VersionCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query post: %w", err)
	}
	return p, nil
}

func (s *PostStore) Update(ctx context.Context, slug string, content string, title *string) error {
	result, err := s.pool.Exec(ctx, `
		UPDATE sho_posts SET content = $1, content_length = $2, title = $3, ai_title = NULL, updated_at = NOW()
		WHERE slug = $4 AND deleted_at IS NULL
	`, content, len(content), title, slug)
	if err != nil {
		return fmt.Errorf("update post: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostStore) SoftDelete(ctx context.Context, slug string) error {
	result, err := s.pool.Exec(ctx, `
		UPDATE sho_posts SET deleted_at = NOW() WHERE slug = $1 AND deleted_at IS NULL
	`, slug)
	if err != nil {
		return fmt.Errorf("soft delete post: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// TryView records a view for the given fingerprint with a 24-hour dedup window.
// Returns the updated view count and whether a new view was counted.
func (s *PostStore) TryView(ctx context.Context, slug, fpHash string) (views int, counted bool, err error) {
	var postID uuid.UUID
	err = s.pool.QueryRow(ctx,
		`SELECT id, views FROM sho_posts WHERE slug = $1 AND deleted_at IS NULL`,
		slug,
	).Scan(&postID, &views)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, ErrNotFound
	}
	if err != nil {
		return 0, false, fmt.Errorf("query post: %w", err)
	}

	// Insert or refresh fingerprint only if the last view was >24h ago.
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO sho_post_view_fingerprints (post_id, fp_hash, last_viewed)
		VALUES ($1, $2, NOW())
		ON CONFLICT (post_id, fp_hash) DO UPDATE
		  SET last_viewed = NOW()
		  WHERE sho_post_view_fingerprints.last_viewed < NOW() - INTERVAL '24 hours'
	`, postID, fpHash)
	if err != nil {
		return views, false, fmt.Errorf("track view: %w", err)
	}

	// Always update last_viewed_at regardless of dedup.
	if _, err = s.pool.Exec(ctx,
		`UPDATE sho_posts SET last_viewed_at = NOW() WHERE id = $1`, postID); err != nil {
		return views, false, fmt.Errorf("update last_viewed_at: %w", err)
	}

	if tag.RowsAffected() == 0 {
		// Already viewed within the past 24 h — return current count unchanged.
		return views, false, nil
	}

	err = s.pool.QueryRow(ctx,
		`UPDATE sho_posts SET views = views + 1 WHERE id = $1 RETURNING views`,
		postID,
	).Scan(&views)
	if err != nil {
		return views, false, fmt.Errorf("increment views: %w", err)
	}
	return views, true, nil
}

// formatFilter returns a SQL fragment and args for filtering by format.
// "markdown" also matches legacy "txt" rows not yet migrated.
// Returns empty string and no extra args when format is empty (no filter).
func formatFilter(format string, startIdx int) (clause string, args []any) {
	if format == "" {
		return "", nil
	}
	if format == "markdown" {
		return fmt.Sprintf(" AND format IN ($%d, $%d)", startIdx, startIdx+1), []any{"markdown", "txt"}
	}
	return fmt.Sprintf(" AND format = $%d", startIdx), []any{format}
}

func scanPosts(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close()
}) ([]*model.Post, error) {
	defer rows.Close()
	var posts []*model.Post
	for rows.Next() {
		p := &model.Post{}
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.AITitle, &p.Content, &p.Format,
			&p.Policy, &p.ContentLength, &p.Views, &p.Likes, &p.Shares, &p.LastViewedAt, &p.CreatedAt, &p.UpdatedAt,
			&p.AgentID, &p.AgentName); err != nil {
			return nil, fmt.Errorf("scan post: %w", err)
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

func (s *PostStore) ListRecent(ctx context.Context, limit, offset int, format string) ([]*model.Post, error) {
	fClause, fArgs := formatFilter(format, 3)
	args := append([]any{limit, offset}, fArgs...)
	rows, err := s.pool.Query(ctx,
		`SELECT id, slug, title, ai_title, content, format, policy, content_length, views, likes, shares, last_viewed_at, created_at, updated_at,
		        agent_id, agent_name
		 FROM sho_posts WHERE deleted_at IS NULL AND unlisted = FALSE`+fClause+`
		 ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
		args...)
	if err != nil {
		return nil, fmt.Errorf("list posts: %w", err)
	}
	return scanPosts(rows)
}

// recommendScore is the SQL expression used for recommendation ranking.
// Score = (engagement + length_bonus) / time_decay
//   engagement  = views + 3*likes + 1        (likes weighted 3× over views)
//   length_bonus = LN(content_length+1)/LN(100)  (≈1 pt per 100 chars, diminishing returns)
//   time_decay  = (age_hours + 2)^1.5        (moderate decay; +2h offset protects fresh posts)
const recommendScore = `
	(views + 3.0 * likes + 1.0 + LN(content_length + 1) / LN(100))
	/ POWER(EXTRACT(EPOCH FROM NOW() - created_at) / 3600.0 + 2.0, 1.5)`

func (s *PostStore) ListRecommended(ctx context.Context, limit, offset int, format string) ([]*model.Post, error) {
	// Fetch extra posts so the service layer can apply format-diversity re-ranking
	fetchLimit := limit*3 + 30
	if fetchLimit > 150 {
		fetchLimit = 150
	}
	fClause, fArgs := formatFilter(format, 3)
	args := append([]any{fetchLimit, offset}, fArgs...)
	rows, err := s.pool.Query(ctx,
		`SELECT id, slug, title, ai_title, content, format, policy, content_length, views, likes, shares, last_viewed_at, created_at, updated_at,
		        agent_id, agent_name
		 FROM sho_posts WHERE deleted_at IS NULL AND unlisted = FALSE`+fClause+`
		 ORDER BY`+recommendScore+` DESC
		 LIMIT $1 OFFSET $2`,
		args...)
	if err != nil {
		return nil, fmt.Errorf("list recommended posts: %w", err)
	}
	return scanPosts(rows)
}

func (s *PostStore) Search(ctx context.Context, query string, limit, offset int, format string) ([]*model.Post, error) {
	pattern := "%" + query + "%"
	fClause, fArgs := formatFilter(format, 4)
	args := append([]any{pattern, limit, offset}, fArgs...)
	rows, err := s.pool.Query(ctx,
		`SELECT id, slug, title, ai_title, content, format, policy, content_length, views, likes, shares, last_viewed_at, created_at, updated_at,
		        agent_id, agent_name
		 FROM sho_posts WHERE deleted_at IS NULL AND unlisted = FALSE AND (title ILIKE $1 OR ai_title ILIKE $1 OR content ILIKE $1)`+fClause+`
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		args...)
	if err != nil {
		return nil, fmt.Errorf("search posts: %w", err)
	}
	return scanPosts(rows)
}

func (s *PostStore) ListVersions(ctx context.Context, postID uuid.UUID, limit int) ([]*model.PostVersion, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, post_id, content, edited_by, created_at
		FROM sho_post_versions WHERE post_id = $1
		ORDER BY created_at DESC LIMIT $2
	`, postID, limit)
	if err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}
	defer rows.Close()

	var versions []*model.PostVersion
	for rows.Next() {
		v := &model.PostVersion{}
		if err := rows.Scan(&v.ID, &v.PostID, &v.Content, &v.EditedBy, &v.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan version: %w", err)
		}
		versions = append(versions, v)
	}
	return versions, rows.Err()
}

func (s *PostStore) SaveVersion(ctx context.Context, postID uuid.UUID, content string, editedBy string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO sho_post_versions (id, post_id, content, edited_by)
		VALUES ($1, $2, $3, $4)
	`, uuid.New(), postID, content, editedBy)
	if err != nil {
		return fmt.Errorf("save version: %w", err)
	}
	return nil
}

// FindByTitleAndContent returns the slug of an existing (non-deleted) post with identical
// title and content combination, or an empty string if none exists.
func (s *PostStore) FindByTitleAndContent(ctx context.Context, title *string, content string) (string, error) {
	var slug string
	var err error
	if title == nil || *title == "" {
		err = s.pool.QueryRow(ctx,
			`SELECT slug FROM sho_posts WHERE (title IS NULL OR title = '') AND content = $1 AND deleted_at IS NULL LIMIT 1`,
			content,
		).Scan(&slug)
	} else {
		err = s.pool.QueryRow(ctx,
			`SELECT slug FROM sho_posts WHERE title = $1 AND content = $2 AND deleted_at IS NULL LIMIT 1`,
			*title, content,
		).Scan(&slug)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("find by title and content: %w", err)
	}
	return slug, nil
}

func (s *PostStore) SlugExists(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM sho_posts WHERE slug = $1)`, slug).Scan(&exists)
	return exists, err
}

func (s *PostStore) TryLike(ctx context.Context, slug, fpHash string) (likes int, alreadyLiked bool, err error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, false, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var postID uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT id, likes FROM sho_posts WHERE slug = $1 AND deleted_at IS NULL`,
		slug,
	).Scan(&postID, &likes)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, ErrNotFound
	}
	if err != nil {
		return 0, false, fmt.Errorf("query post: %w", err)
	}

	tag, err := tx.Exec(ctx,
		`INSERT INTO sho_post_like_fingerprints (post_id, fp_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		postID, fpHash,
	)
	if err != nil {
		return 0, false, fmt.Errorf("insert fingerprint: %w", err)
	}

	if tag.RowsAffected() == 0 {
		_ = tx.Rollback(ctx)
		return likes, true, nil // 已点赞，直接返回当前值
	}

	err = tx.QueryRow(ctx,
		`UPDATE sho_posts SET likes = likes + 1 WHERE id = $1 RETURNING likes`,
		postID,
	).Scan(&likes)
	if err != nil {
		return 0, false, fmt.Errorf("incr like: %w", err)
	}

	return likes, false, tx.Commit(ctx)
}

func (s *PostStore) TryShare(ctx context.Context, slug, fpHash string) (shares int, alreadyShared bool, err error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, false, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var postID uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT id, shares FROM sho_posts WHERE slug = $1 AND deleted_at IS NULL`,
		slug,
	).Scan(&postID, &shares)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, ErrNotFound
	}
	if err != nil {
		return 0, false, fmt.Errorf("query post: %w", err)
	}

	tag, err := tx.Exec(ctx,
		`INSERT INTO sho_post_share_fingerprints (post_id, fp_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		postID, fpHash,
	)
	if err != nil {
		return 0, false, fmt.Errorf("insert fingerprint: %w", err)
	}

	if tag.RowsAffected() == 0 {
		_ = tx.Rollback(ctx)
		return shares, true, nil
	}

	err = tx.QueryRow(ctx,
		`UPDATE sho_posts SET shares = shares + 1 WHERE id = $1 RETURNING shares`,
		postID,
	).Scan(&shares)
	if err != nil {
		return 0, false, fmt.Errorf("incr share: %w", err)
	}

	return shares, false, tx.Commit(ctx)
}

func (s *PostStore) CreateComment(ctx context.Context, postID uuid.UUID, parentID *uuid.UUID, content string) (*model.Comment, error) {
	c := &model.Comment{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO sho_comments (post_id, parent_id, content) VALUES ($1, $2, $3)
		RETURNING id, post_id, parent_id, content, created_at
	`, postID, parentID, content).Scan(&c.ID, &c.PostID, &c.ParentID, &c.Content, &c.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}
	return c, nil
}

func (s *PostStore) GetComment(ctx context.Context, commentID uuid.UUID) (*model.Comment, error) {
	c := &model.Comment{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, post_id, parent_id, content, created_at FROM sho_comments WHERE id = $1
	`, commentID).Scan(&c.ID, &c.PostID, &c.ParentID, &c.Content, &c.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get comment: %w", err)
	}
	return c, nil
}

func (s *PostStore) GetComments(ctx context.Context, slug string, limit int) ([]*model.Comment, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.post_id, c.parent_id, c.content, c.created_at
		FROM sho_comments c
		JOIN sho_posts p ON p.id = c.post_id
		WHERE p.slug = $1 AND p.deleted_at IS NULL
		ORDER BY c.created_at ASC
		LIMIT $2
	`, slug, limit)
	if err != nil {
		return nil, fmt.Errorf("get comments: %w", err)
	}
	defer rows.Close()

	var comments []*model.Comment
	for rows.Next() {
		c := &model.Comment{}
		if err := rows.Scan(&c.ID, &c.PostID, &c.ParentID, &c.Content, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan comment: %w", err)
		}
		comments = append(comments, c)
	}
	return comments, rows.Err()
}

func (s *PostStore) ListByAgent(ctx context.Context, agentID string, limit, offset int) ([]*model.Post, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, slug, title, ai_title, content, format, policy, content_length, views, likes, shares, last_viewed_at, created_at, updated_at,
		        agent_id, agent_name
		 FROM sho_posts WHERE deleted_at IS NULL AND agent_id = $1
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		agentID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list by agent: %w", err)
	}
	return scanPosts(rows)
}

// ListPendingAITitle returns posts that have no AI-generated title yet.
func (s *PostStore) ListPendingAITitle(ctx context.Context, batchSize int) ([]*model.Post, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, slug, title, content, format
		FROM sho_posts
		WHERE ai_title IS NULL AND deleted_at IS NULL AND content_length > 10
		ORDER BY created_at DESC
		LIMIT $1
	`, batchSize)
	if err != nil {
		return nil, fmt.Errorf("list pending ai title: %w", err)
	}
	defer rows.Close()

	var posts []*model.Post
	for rows.Next() {
		p := &model.Post{}
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Content, &p.Format); err != nil {
			return nil, fmt.Errorf("scan pending ai title: %w", err)
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

// UpdateAITitle sets the AI-generated title for a post.
func (s *PostStore) UpdateAITitle(ctx context.Context, postID uuid.UUID, aiTitle string) error {
	_, err := s.pool.Exec(ctx, `UPDATE sho_posts SET ai_title = $1 WHERE id = $2`, aiTitle, postID)
	if err != nil {
		return fmt.Errorf("update ai title: %w", err)
	}
	return nil
}
