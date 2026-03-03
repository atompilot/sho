-- Add render error tracking to posts
ALTER TABLE sho_posts ADD COLUMN IF NOT EXISTS render_errors INTEGER NOT NULL DEFAULT 0;

-- Fingerprint dedup table for render error reports (24h window)
CREATE TABLE IF NOT EXISTS sho_post_render_error_fingerprints (
    post_id   UUID NOT NULL REFERENCES sho_posts(id) ON DELETE CASCADE,
    fp_hash   TEXT NOT NULL,
    last_reported TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, fp_hash)
);
