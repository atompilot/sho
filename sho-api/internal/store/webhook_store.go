package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Webhook struct {
	ID          uuid.UUID `json:"id"`
	PostSlug    string    `json:"post_slug"`
	EndpointURL string    `json:"endpoint_url"`
	Events      []string  `json:"events"`
	Secret      *string   `json:"-"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
}

type WebhookStore struct {
	pool *pgxpool.Pool
}

func NewWebhookStore(pool *pgxpool.Pool) *WebhookStore {
	return &WebhookStore{pool: pool}
}

func (s *WebhookStore) Create(ctx context.Context, wh *Webhook) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO sho_webhooks (id, post_slug, endpoint_url, events, secret, is_active)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, wh.ID, wh.PostSlug, wh.EndpointURL, wh.Events, wh.Secret, wh.IsActive)
	if err != nil {
		return fmt.Errorf("insert webhook: %w", err)
	}
	return nil
}

func (s *WebhookStore) ListBySlug(ctx context.Context, slug string) ([]*Webhook, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, post_slug, endpoint_url, events, secret, is_active, created_at
		FROM sho_webhooks WHERE post_slug = $1 AND is_active = TRUE
	`, slug)
	if err != nil {
		return nil, fmt.Errorf("list webhooks: %w", err)
	}
	defer rows.Close()

	var webhooks []*Webhook
	for rows.Next() {
		wh := &Webhook{}
		if err := rows.Scan(&wh.ID, &wh.PostSlug, &wh.EndpointURL, &wh.Events, &wh.Secret, &wh.IsActive, &wh.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan webhook: %w", err)
		}
		webhooks = append(webhooks, wh)
	}
	return webhooks, rows.Err()
}
