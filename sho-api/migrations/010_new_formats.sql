-- Migration 010: Add new content formats (svg, csv, json, lottie, p5, reveal, glsl)
-- The original CHECK constraint is inline on the column; PostgreSQL requires
-- dropping the constraint by name. We replace it with a new table-level constraint.

ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_format_check;

-- Also drop the constraint added by migration 006 (posts_format_no_txt)
ALTER TABLE posts
  DROP CONSTRAINT IF EXISTS posts_format_no_txt;

ALTER TABLE posts
  ADD CONSTRAINT posts_format_check
    CHECK (format IN ('markdown', 'html', 'txt', 'jsx', 'svg', 'csv', 'json', 'lottie', 'p5', 'reveal', 'glsl'));
