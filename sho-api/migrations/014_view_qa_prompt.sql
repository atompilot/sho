-- AI QA custom judgment prompt
ALTER TABLE sho_posts ADD COLUMN IF NOT EXISTS view_qa_prompt TEXT;
