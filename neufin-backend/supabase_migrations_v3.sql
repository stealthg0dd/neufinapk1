-- ── Push alert subscriptions ────────────────────────────────────────────────
-- Stores Expo push tokens + the portfolio symbols each subscriber holds.
-- The alerts router upserts on expo_push_token so re-registration is idempotent.
CREATE TABLE IF NOT EXISTS push_alert_subscriptions (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  expo_push_token  TEXT        UNIQUE NOT NULL,
  symbols          TEXT[]      DEFAULT '{}',
  user_label       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_token   ON push_alert_subscriptions (expo_push_token);
CREATE INDEX IF NOT EXISTS idx_push_symbols ON push_alert_subscriptions USING gin (symbols);

-- No auth.uid() required — mobile clients may not be logged in.
-- Service role only (RLS enabled, no public policy → backend bypasses via service key).
ALTER TABLE push_alert_subscriptions ENABLE ROW LEVEL SECURITY;


-- ── Macro shift alert log ────────────────────────────────────────────────────
-- Every macro-regime event broadcast by the Strategist Agent is persisted here.
-- The mobile app polls GET /api/alerts/recent to populate the SwarmAlertsScreen.
CREATE TABLE IF NOT EXISTS macro_shift_alerts (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title            TEXT        NOT NULL,
  body             TEXT        NOT NULL,
  regime           TEXT        NOT NULL,
  cpi_yoy          TEXT,
  affected_symbols TEXT[]      DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_created  ON macro_shift_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_regime   ON macro_shift_alerts (regime);
CREATE INDEX IF NOT EXISTS idx_alerts_symbols  ON macro_shift_alerts USING gin (affected_symbols);

-- Public read — alerts are broadcast to all subscribers, no PII.
ALTER TABLE macro_shift_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_public_read" ON macro_shift_alerts
  FOR SELECT USING (true);


-- ── Market data cache (Supabase tier of the 3-tier cache) ────────────────────
-- Redis is Tier-1 (24h). This table is Tier-2 fallback.
-- Upserted by market_cache.py with 24h expiry; stale rows cleaned by the
-- Supabase pg_cron job below (or manually).
CREATE TABLE IF NOT EXISTS market_data_cache (
  cache_key   TEXT        PRIMARY KEY,          -- neufin:timeseries:{SYMBOL}:{DAYS}
  payload     TEXT        NOT NULL,             -- JSON-serialised pd.Series
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON market_data_cache (expires_at);

-- Service role only — no public access to raw price series.
ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;


-- ── Scheduled cleanup (requires pg_cron extension) ───────────────────────────
-- Uncomment after enabling pg_cron in Supabase Dashboard → Database → Extensions.
--
-- SELECT cron.schedule(
--   'purge-expired-market-cache',
--   '0 * * * *',   -- every hour
--   $$ DELETE FROM market_data_cache WHERE expires_at < NOW() $$
-- );
