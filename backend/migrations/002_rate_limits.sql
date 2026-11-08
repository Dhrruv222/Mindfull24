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
