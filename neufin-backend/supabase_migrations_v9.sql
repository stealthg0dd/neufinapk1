-- ============================================================
-- supabase_migrations_v9.sql
-- NeuFin Commercial Tiers — Usage Tracking & API Keys
-- ============================================================
-- Run in Supabase SQL Editor or via psql.
-- All tables have RLS enabled; policies allow each user to
-- read/write only their own rows (service role bypasses RLS).

-- ── 1. usage_tracking ────────────────────────────────────────
-- Monthly counters for DNA analyses, swarm analyses, and API calls.
CREATE TABLE IF NOT EXISTS usage_tracking (
    user_id        TEXT        NOT NULL,
    month_year     TEXT        NOT NULL,   -- e.g. "2026-04"
    dna_analyses   INTEGER     NOT NULL DEFAULT 0,
    swarm_analyses INTEGER     NOT NULL DEFAULT 0,
    api_calls      INTEGER     NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, month_year)
);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id
    ON usage_tracking (user_id);

-- RLS
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage" ON usage_tracking
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Service role full access to usage_tracking" ON usage_tracking
    FOR ALL USING (auth.role() = 'service_role');

-- ── 2. api_keys ───────────────────────────────────────────────
-- API keys for Tier 3 (enterprise) customers.
-- Keys are stored as SHA-256 hashes; raw keys are never persisted.
CREATE TABLE IF NOT EXISTS api_keys (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            TEXT        NOT NULL,
    key_hash           TEXT        NOT NULL UNIQUE,
    name               TEXT        NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at       TIMESTAMPTZ,
    is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
    rate_limit_per_day INTEGER     NOT NULL DEFAULT 10000
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id   ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash  ON api_keys (key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own API keys" ON api_keys
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Service role full access to api_keys" ON api_keys
    FOR ALL USING (auth.role() = 'service_role');

-- ── 3. api_keys_daily_usage ───────────────────────────────────
-- Per-key daily call counters for rate limiting.
CREATE TABLE IF NOT EXISTS api_keys_daily_usage (
    key_id  UUID    NOT NULL REFERENCES api_keys (id) ON DELETE CASCADE,
    date    DATE    NOT NULL,
    calls   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key_id, date)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_daily_usage_key_id
    ON api_keys_daily_usage (key_id);

ALTER TABLE api_keys_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to api_keys_daily_usage" ON api_keys_daily_usage
    FOR ALL USING (auth.role() = 'service_role');

-- ── 4. portfolios — add advisor-client columns ────────────────
-- Add columns for multi-client advisor dashboard (safe if already exist).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='portfolios' AND column_name='advisor_id'
    ) THEN
        ALTER TABLE portfolios ADD COLUMN advisor_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='portfolios' AND column_name='client_name'
    ) THEN
        ALTER TABLE portfolios ADD COLUMN client_name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='portfolios' AND column_name='client_email'
    ) THEN
        ALTER TABLE portfolios ADD COLUMN client_email TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='portfolios' AND column_name='notes'
    ) THEN
        ALTER TABLE portfolios ADD COLUMN notes TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_portfolios_advisor_id
    ON portfolios (advisor_id)
    WHERE advisor_id IS NOT NULL;

-- ── 5. user_profiles — add subscription_tier column ──────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='user_profiles' AND column_name='subscription_tier'
    ) THEN
        ALTER TABLE user_profiles
            ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free'
            CHECK (subscription_tier IN ('free', 'retail', 'advisor', 'enterprise'));
    END IF;
END $$;
