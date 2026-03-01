-- Store precomputed content length for use in recommendation scoring
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_length INT NOT NULL DEFAULT 0;

-- Backfill existing rows (byte length is fine for scoring purposes)
UPDATE posts SET content_length = LENGTH(content) WHERE content_length = 0;
