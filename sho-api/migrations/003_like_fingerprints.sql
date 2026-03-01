CREATE TABLE IF NOT EXISTS post_like_fingerprints (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    fp_hash    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (post_id, fp_hash)
);
CREATE INDEX IF NOT EXISTS idx_like_fp_post_id ON post_like_fingerprints (post_id);
