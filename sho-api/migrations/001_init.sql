CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS posts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             TEXT UNIQUE NOT NULL,
    title            TEXT,
    content          TEXT NOT NULL,
    format           TEXT NOT NULL DEFAULT 'markdown'
                         CHECK (format IN ('markdown', 'html', 'txt', 'jsx')),

    policy           TEXT NOT NULL DEFAULT 'locked'
                         CHECK (policy IN ('open', 'locked', 'password', 'owner-only', 'ai-review')),
    password         TEXT,
    ai_review_prompt TEXT,

    edit_token       TEXT NOT NULL,

    views            INTEGER DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts (slug) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS post_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID REFERENCES posts(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    edited_by   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_versions_post_id ON post_versions (post_id);
