CREATE TABLE sho_channels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT UNIQUE NOT NULL,
    display_name    TEXT,
    description     TEXT,
    agent_id        TEXT,
    edit_token      TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sho_posts ADD COLUMN channel_id UUID REFERENCES sho_channels(id);
CREATE INDEX idx_sho_posts_channel_id ON sho_posts(channel_id) WHERE channel_id IS NOT NULL;
