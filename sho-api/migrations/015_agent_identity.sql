ALTER TABLE sho_posts ADD COLUMN agent_id TEXT;
ALTER TABLE sho_posts ADD COLUMN agent_name TEXT;
CREATE INDEX idx_sho_posts_agent_id ON sho_posts(agent_id) WHERE agent_id IS NOT NULL;
