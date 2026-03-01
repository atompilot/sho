-- +migrate Up
ALTER TABLE posts ADD COLUMN ai_title TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_pending_ai_title
  ON posts (created_at DESC)
  WHERE ai_title IS NULL AND deleted_at IS NULL;

-- +migrate Down
DROP INDEX IF EXISTS idx_posts_pending_ai_title;
ALTER TABLE posts DROP COLUMN ai_title;
