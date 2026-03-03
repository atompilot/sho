-- Migration 020: Add image format support

ALTER TABLE sho_posts
  DROP CONSTRAINT IF EXISTS posts_format_check;

ALTER TABLE sho_posts
  DROP CONSTRAINT IF EXISTS sho_posts_format_check;

ALTER TABLE sho_posts
  ADD CONSTRAINT sho_posts_format_check
    CHECK (format IN ('markdown', 'html', 'txt', 'jsx', 'svg', 'csv', 'json', 'lottie', 'p5', 'reveal', 'glsl', 'image'));
