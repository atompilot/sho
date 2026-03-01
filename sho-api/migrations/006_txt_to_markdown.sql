-- Merge txt into markdown: convert existing data first
UPDATE posts SET format = 'markdown' WHERE format = 'txt';

-- Remove old format check constraint (which allowed 'txt') and add a new one
DO $$
DECLARE
    cname text;
BEGIN
    SELECT c.conname INTO cname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'posts' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%txt%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE posts DROP CONSTRAINT %I', cname);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'posts' AND c.conname = 'posts_format_no_txt'
    ) THEN
        ALTER TABLE posts ADD CONSTRAINT posts_format_no_txt
            CHECK (format IN ('markdown', 'html', 'jsx'));
    END IF;
END $$;
