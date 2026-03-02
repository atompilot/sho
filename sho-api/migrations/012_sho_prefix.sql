-- +migrate Up
ALTER TABLE posts RENAME TO sho_posts;
ALTER TABLE post_versions RENAME TO sho_post_versions;
ALTER TABLE comments RENAME TO sho_comments;
ALTER TABLE post_like_fingerprints RENAME TO sho_post_like_fingerprints;
ALTER TABLE post_view_fingerprints RENAME TO sho_post_view_fingerprints;

-- +migrate Down
ALTER TABLE sho_posts RENAME TO posts;
ALTER TABLE sho_post_versions RENAME TO post_versions;
ALTER TABLE sho_comments RENAME TO comments;
ALTER TABLE sho_post_like_fingerprints RENAME TO post_like_fingerprints;
ALTER TABLE sho_post_view_fingerprints RENAME TO post_view_fingerprints;
