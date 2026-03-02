CREATE TABLE sho_webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_slug       TEXT NOT NULL,
    endpoint_url    TEXT NOT NULL,
    events          TEXT[] NOT NULL DEFAULT '{}',
    secret          TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sho_webhooks_post_slug ON sho_webhooks(post_slug);
