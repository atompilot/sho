package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/atompilot/sho-api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrChannelNotFound = errors.New("channel not found")

type ChannelStore struct {
	pool *pgxpool.Pool
}

func NewChannelStore(pool *pgxpool.Pool) *ChannelStore {
	return &ChannelStore{pool: pool}
}

func (s *ChannelStore) Create(ctx context.Context, ch *model.Channel) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO sho_channels (id, name, display_name, description, agent_id, edit_token)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, ch.ID, ch.Name, ch.DisplayName, ch.Description, ch.AgentID, ch.EditToken)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return errors.New("channel name already taken")
		}
		return fmt.Errorf("insert channel: %w", err)
	}
	return nil
}

func (s *ChannelStore) GetByName(ctx context.Context, name string) (*model.Channel, error) {
	ch := &model.Channel{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, display_name, description, agent_id, edit_token, created_at
		FROM sho_channels WHERE name = $1
	`, name).Scan(&ch.ID, &ch.Name, &ch.DisplayName, &ch.Description, &ch.AgentID, &ch.EditToken, &ch.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChannelNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("query channel: %w", err)
	}
	return ch, nil
}

func (s *ChannelStore) ListPosts(ctx context.Context, channelName string, limit, offset int) ([]*model.Post, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.id, p.slug, p.title, p.ai_title, p.content, p.format, p.policy, p.content_length,
		       p.views, p.likes, p.last_viewed_at, p.created_at, p.updated_at,
		       p.agent_id, p.agent_name
		FROM sho_posts p
		JOIN sho_channels c ON c.id = p.channel_id
		WHERE c.name = $1 AND p.deleted_at IS NULL
		ORDER BY p.created_at DESC LIMIT $2 OFFSET $3
	`, channelName, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list channel posts: %w", err)
	}
	return scanPosts(rows)
}
