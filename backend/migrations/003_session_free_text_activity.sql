-- Sessions can describe their own activity as free text instead of linking a calendar door.
ALTER TABLE group_sessions ALTER COLUMN activity_id DROP NOT NULL;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS activity_name VARCHAR(200);
ALTER TABLE group_sessions DROP CONSTRAINT IF EXISTS ck_session_activity;
ALTER TABLE group_sessions ADD CONSTRAINT ck_session_activity CHECK (activity_id IS NOT NULL OR activity_name IS NOT NULL);
