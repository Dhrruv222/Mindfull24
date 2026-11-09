-- Update for an EXISTING Supabase database (keeps all data). Paste into SQL Editor > New query > Run once.
-- Chronological door scheduling, calendar membership and door-open history (SACA-11, SACA-10).

-- Door N of a calendar unlocks on start_date + (N - 1) days (UTC). Server-enforced.
ALTER TABLE calendars ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE;
-- Demo data: begin the demo calendars 11 days ago so the first 12 doors are already open and the rest are still locked.
UPDATE calendars SET start_date = CURRENT_DATE - 11;

ALTER TABLE rewards ADD COLUMN IF NOT EXISTS icon VARCHAR(40) NOT NULL DEFAULT 'ph-gift';
UPDATE rewards SET icon = CASE
  WHEN partner_name ILIKE '%cafe%' THEN 'ph-coffee'
  WHEN partner_name ILIKE '%fuel%' THEN 'ph-barbell'
  WHEN partner_name ILIKE '%book%' THEN 'ph-book-open-text'
  WHEN partner_name ILIKE '%sports%' THEN 'ph-soccer-ball'
  WHEN partner_name ILIKE '%zen%' THEN 'ph-flower-lotus'
  WHEN partner_name ILIKE '%stadium%' THEN 'ph-ticket'
  ELSE icon END;

CREATE TABLE IF NOT EXISTS user_calendars (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  calendar_id INT NOT NULL REFERENCES calendars (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_calendar UNIQUE (user_id, calendar_id)
);

CREATE TABLE IF NOT EXISTS activity_opens (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  activity_id INT NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_open_user_activity UNIQUE (user_id, activity_id)
);
CREATE INDEX IF NOT EXISTS idx_opens_user ON activity_opens (user_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_completions_user_date ON activity_completions (user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_members_user ON group_session_members (user_id, joined_at);

ALTER TABLE user_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_opens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON user_calendars, activity_opens FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON user_calendars, activity_opens FROM authenticated;
  END IF;
END $$;

-- Backfill from real rows: a completed door was necessarily opened, and its calendar started.
INSERT INTO activity_opens (user_id, activity_id, opened_at) SELECT user_id, activity_id, completed_at FROM activity_completions ON CONFLICT DO NOTHING;
INSERT INTO user_calendars (user_id, calendar_id, joined_at)
  SELECT ac.user_id, a.calendar_id, MIN(ac.completed_at) FROM activity_completions ac JOIN activities a ON a.id = ac.activity_id
  GROUP BY ac.user_id, a.calendar_id ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations (name) VALUES ('004_schedule_timeline.sql') ON CONFLICT DO NOTHING;
