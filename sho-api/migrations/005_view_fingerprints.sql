-- Deduplicated view tracking: same fingerprint within 24 h counts as one view
CREATE TABLE IF NOT EXISTS post_view_fingerprints (
    post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    fp_hash     TEXT NOT NULL,
    last_viewed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, fp_hash)
);

CREATE INDEX IF NOT EXISTS idx_view_fp_post_id ON post_view_fingerprints (post_id);

-- Add likes column if not present (earlier migration may have added it already)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes INTEGER NOT NULL DEFAULT 0;
