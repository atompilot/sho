-- +migrate Up
ALTER TABLE posts ADD COLUMN last_viewed_at TIMESTAMPTZ;

-- Backfill from existing view fingerprint data
UPDATE posts SET last_viewed_at = sub.max_viewed
FROM (
    SELECT post_id, MAX(last_viewed) AS max_viewed
    FROM post_view_fingerprints
    GROUP BY post_id
) sub
WHERE posts.id = sub.post_id;

-- +migrate Down
ALTER TABLE posts DROP COLUMN last_viewed_at;
