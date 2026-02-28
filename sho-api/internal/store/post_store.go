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
		       views, created_at, updated_at
		FROM posts WHERE slug = $1 AND deleted_at IS NULL
	`, slug).Scan(
		&p.ID, &p.Slug, &p.Title, &p.Content, &p.Format, &p.Policy,
		&p.Password, &p.AIReviewPrompt, &p.EditToken,
		&p.Views, &p.CreatedAt, &p.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query post: %w", err)
	}
	return p, nil
}

func (s *PostStore) Update(ctx context.Context, slug string, content string) error {
	result, err := s.pool.Exec(ctx, `
		UPDATE posts SET content = $1, updated_at = NOW()
		WHERE slug = $2 AND deleted_at IS NULL
	`, content, slug)
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
		SELECT id, slug, title, content, format, policy, views, created_at, updated_at
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
			&p.Policy, &p.Views, &p.CreatedAt, &p.UpdatedAt); err != nil {
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
