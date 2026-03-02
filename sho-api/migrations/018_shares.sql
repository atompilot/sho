-- Share count on posts + deduplication fingerprints
ALTER TABLE sho_posts ADD COLUMN IF NOT EXISTS shares INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sho_post_share_fingerprints (
    post_id UUID NOT NULL REFERENCES sho_posts(id) ON DELETE CASCADE,
    fp_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, fp_hash)
);

CREATE INDEX IF NOT EXISTS idx_share_fp_post_id ON sho_post_share_fingerprints (post_id);
