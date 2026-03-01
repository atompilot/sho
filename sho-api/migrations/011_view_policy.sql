-- 011: Add view_policy support for controlling post viewing permissions
ALTER TABLE posts ADD COLUMN view_policy TEXT NOT NULL DEFAULT 'open'
    CHECK (view_policy IN ('open', 'password', 'human-qa', 'ai-qa'));
ALTER TABLE posts ADD COLUMN view_password TEXT;
ALTER TABLE posts ADD COLUMN view_qa_question TEXT;
ALTER TABLE posts ADD COLUMN view_qa_answer TEXT;
