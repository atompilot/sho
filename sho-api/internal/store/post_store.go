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
	_, err := s.pool.Exec(ctx, `
		INSERT INTO posts (id, slug, title, content, format, policy, password, ai_review_prompt, edit_token)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, p.ID, p.Slug, p.Title, p.Content, p.Format, p.Policy, p.Password, p.AIReviewPrompt, p.EditToken)
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
		SELECT id, slug, title, content, format, policy, password, ai_review_prompt, edit_token,
		       views, likes, created_at, updated_at
		FROM posts WHERE slug = $1 AND deleted_at IS NULL
	`, slug).Scan(
		&p.ID, &p.Slug, &p.Title, &p.Content, &p.Format, &p.Policy,
		&p.Password, &p.AIReviewPrompt, &p.EditToken,
		&p.Views, &p.Likes, &p.CreatedAt, &p.UpdatedAt,
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
		UPDATE posts SET content = $1, title = $2, updated_at = NOW()
		WHERE slug = $3 AND deleted_at IS NULL
	`, content, title, slug)
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
		UPDATE posts SET deleted_at = NOW() WHERE slug = $1 AND deleted_at IS NULL
	`, slug)
	if err != nil {
		return fmt.Errorf("soft delete post: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostStore) IncrViews(ctx context.Context, slug string) {
	// best-effort, ignore error
	s.pool.Exec(ctx, `UPDATE posts SET views = views + 1 WHERE slug = $1`, slug) //nolint:errcheck
}

func (s *PostStore) ListRecent(ctx context.Context, limit, offset int) ([]*model.Post, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, slug, title, content, format, policy, views, likes, created_at, updated_at
		FROM posts WHERE deleted_at IS NULL
		ORDER BY created_at DESC LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list posts: %w", err)
	}
	defer rows.Close()

	var posts []*model.Post
	for rows.Next() {
		p := &model.Post{}
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Content, &p.Format,
			&p.Policy, &p.Views, &p.Likes, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan post: %w", err)
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

func (s *PostStore) ListRecommended(ctx context.Context, limit, offset int) ([]*model.Post, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, slug, title, content, format, policy, views, likes, created_at, updated_at
		FROM posts WHERE deleted_at IS NULL
		ORDER BY (views + 3.0 * likes + 1.0) / POWER(EXTRACT(EPOCH FROM NOW() - created_at) / 3600.0 + 2.0, 1.5) DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list recommended posts: %w", err)
	}
	defer rows.Close()

	var posts []*model.Post
	for rows.Next() {
		p := &model.Post{}
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Content, &p.Format,
			&p.Policy, &p.Views, &p.Likes, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan post: %w", err)
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

func (s *PostStore) Search(ctx context.Context, query string, limit, offset int) ([]*model.Post, error) {
	pattern := "%" + query + "%"
	rows, err := s.pool.Query(ctx, `
		SELECT id, slug, title, content, format, policy, views, likes, created_at, updated_at
		FROM posts WHERE deleted_at IS NULL AND (title ILIKE $1 OR content ILIKE $1)
		ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`, pattern, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("search posts: %w", err)
	}
	defer rows.Close()

	var posts []*model.Post
	for rows.Next() {
		p := &model.Post{}
		if err := rows.Scan(&p.ID, &p.Slug, &p.Title, &p.Content, &p.Format,
			&p.Policy, &p.Views, &p.Likes, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan post: %w", err)
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

func (s *PostStore) SaveVersion(ctx context.Context, postID uuid.UUID, content string, editedBy string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO post_versions (id, post_id, content, edited_by)
		VALUES ($1, $2, $3, $4)
	`, uuid.New(), postID, content, editedBy)
	if err != nil {
		return fmt.Errorf("save version: %w", err)
	}
	return nil
}

func (s *PostStore) SlugExists(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM posts WHERE slug = $1)`, slug).Scan(&exists)
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
		`SELECT id, likes FROM posts WHERE slug = $1 AND deleted_at IS NULL`,
		slug,
	).Scan(&postID, &likes)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, ErrNotFound
	}
	if err != nil {
		return 0, false, fmt.Errorf("query post: %w", err)
	}

	tag, err := tx.Exec(ctx,
		`INSERT INTO post_like_fingerprints (post_id, fp_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
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
		`UPDATE posts SET likes = likes + 1 WHERE id = $1 RETURNING likes`,
		postID,
	).Scan(&likes)
	if err != nil {
		return 0, false, fmt.Errorf("incr like: %w", err)
	}

	return likes, false, tx.Commit(ctx)
}

func (s *PostStore) CreateComment(ctx context.Context, postID uuid.UUID, parentID *uuid.UUID, content string) (*model.Comment, error) {
	c := &model.Comment{}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO comments (post_id, parent_id, content) VALUES ($1, $2, $3)
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
		SELECT id, post_id, parent_id, content, created_at FROM comments WHERE id = $1
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
		FROM comments c
		JOIN posts p ON p.id = c.post_id
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
