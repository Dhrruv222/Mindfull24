-- Advent Calendar (SACA) schema for Supabase. Paste into SQL Editor > New query > Run.
-- WARNING: drops and recreates the app tables below (other tables in your project are not touched).
DROP TABLE IF EXISTS rate_limits, group_session_members, group_sessions, redemptions, promo_codes, rewards, randomizer_draws, activity_opens, user_calendars, points_ledger, activity_completions, activities, calendars, revoked_tokens, users, schema_migrations CASCADE;

-- ===== 001_init.sql =====
-- SACA / Advent Calendar schema (PostgreSQL / Supabase)

CREATE TABLE users (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  -- Synchronised balance: only ever changed together with a points_ledger row.
  points_balance INT NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_users_email UNIQUE (email)
);
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));

CREATE TABLE revoked_tokens (
  jti TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_revoked_expires ON revoked_tokens (expires_at);

CREATE TABLE calendars (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(40) NOT NULL DEFAULT 'ph-calendar-heart',
  tier_required TEXT NOT NULL DEFAULT 'free' CHECK (tier_required IN ('free', 'premium')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'coming_soon', 'inactive'))
);

CREATE TABLE activities (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  calendar_id INT NOT NULL REFERENCES calendars (id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  instructions TEXT NOT NULL,
  day_number INT NOT NULL CHECK (day_number > 0),
  points INT NOT NULL DEFAULT 20 CHECK (points > 0),
  duration VARCHAR(30) NOT NULL DEFAULT '5 mins',
  icon VARCHAR(40) NOT NULL DEFAULT 'ph-sparkle',
  tier_required TEXT NOT NULL DEFAULT 'free' CHECK (tier_required IN ('free', 'premium')),
  randomizer_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  CONSTRAINT uq_activity_day UNIQUE (calendar_id, day_number)
);

CREATE TABLE activity_completions (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  activity_id INT NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  points_awarded INT NOT NULL CHECK (points_awarded > 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_completion_user_activity UNIQUE (user_id, activity_id)
);

CREATE TABLE points_ledger (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn', 'spend')),
  amount INT NOT NULL CHECK (amount > 0),
  balance_after INT NOT NULL,
  reference_type VARCHAR(30) NOT NULL,
  reference_id INT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ledger_idempotency UNIQUE (idempotency_key)
);
CREATE INDEX idx_ledger_user ON points_ledger (user_id, id);

CREATE TABLE randomizer_draws (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  activity_id INT NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  drawn_at TIMESTAMPTZ NOT NULL,
  cooldown_until TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_draws_user ON randomizer_draws (user_id, id);

CREATE TABLE rewards (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_name VARCHAR(120) NOT NULL,
  reward_title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  points_cost INT NOT NULL CHECK (points_cost > 0),
  -- availability = which tier may redeem the offer
  availability TEXT NOT NULL DEFAULT 'free' CHECK (availability IN ('free', 'premium')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE promo_codes (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reward_id INT NOT NULL REFERENCES rewards (id) ON DELETE CASCADE,
  promo_code VARCHAR(60) NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'issued')),
  issued_to INT NULL REFERENCES users (id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NULL,
  CONSTRAINT uq_promo_code UNIQUE (promo_code)
);
CREATE INDEX idx_promo_reward_status ON promo_codes (reward_id, status);

CREATE TABLE redemptions (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reward_id INT NOT NULL REFERENCES rewards (id),
  promo_code_id INT NOT NULL REFERENCES promo_codes (id),
  points_spent INT NOT NULL CHECK (points_spent > 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_redemption_promo UNIQUE (promo_code_id)
);
CREATE INDEX idx_redemption_user ON redemptions (user_id, id);

CREATE TABLE group_sessions (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creator_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  activity_id INT NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  session_date TIMESTAMPTZ NOT NULL,
  capacity INT NOT NULL CHECK (capacity BETWEEN 2 AND 50),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_date ON group_sessions (session_date);

CREATE TABLE group_session_members (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id INT NOT NULL REFERENCES group_sessions (id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_session_member UNIQUE (session_id, user_id)
);

-- Supabase exposes the public schema through its REST API using the anon/authenticated roles.
-- Row Level Security with no policies blocks that path completely; only this backend (direct
-- database connection) can read or write. Never add permissive policies here.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE randomizer_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_session_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON users, revoked_tokens, calendars, activities, activity_completions, points_ledger,
      randomizer_draws, rewards, promo_codes, redemptions, group_sessions, group_session_members FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON users, revoked_tokens, calendars, activities, activity_completions, points_ledger,
      randomizer_draws, rewards, promo_codes, redemptions, group_sessions, group_session_members FROM authenticated;
  END IF;
END $$;

-- ===== 002_rate_limits.sql =====
-- Shared (database-backed) counters for login/registration throttling. Works across serverless instances.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON rate_limits FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON rate_limits FROM authenticated;
  END IF;
END $$;

-- ===== 003_session_free_text_activity.sql =====
-- Sessions can describe their own activity as free text instead of linking a calendar door.
ALTER TABLE group_sessions ALTER COLUMN activity_id DROP NOT NULL;
ALTER TABLE group_sessions ADD COLUMN IF NOT EXISTS activity_name VARCHAR(200);
ALTER TABLE group_sessions DROP CONSTRAINT IF EXISTS ck_session_activity;
ALTER TABLE group_sessions ADD CONSTRAINT ck_session_activity CHECK (activity_id IS NOT NULL OR activity_name IS NOT NULL);

-- ===== 004_schedule_timeline.sql =====
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

CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now());
INSERT INTO schema_migrations (name) VALUES ('001_init.sql'), ('002_rate_limits.sql'), ('003_session_free_text_activity.sql'), ('004_schedule_timeline.sql');
