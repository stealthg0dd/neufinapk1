-- ============================================================
-- Migration: SEA-NATIVE-TICKER-FIX — market resolution support
-- Run in the Supabase SQL Editor (Project → SQL → New query)
-- ============================================================

-- 1. Ensure portfolio_positions has the SEA metadata columns
--    (safe to run even if they already exist — idempotent)
ALTER TABLE portfolio_positions
  ADD COLUMN IF NOT EXISTS native_currency   TEXT,
  ADD COLUMN IF NOT EXISTS market_code       TEXT,
  ADD COLUMN IF NOT EXISTS provider_ticker   TEXT,
  ADD COLUMN IF NOT EXISTS native_price      NUMERIC,
  ADD COLUMN IF NOT EXISTS price_status      TEXT    DEFAULT 'live';

-- 2. Ensure symbol_market_resolution cache table exists
--    (canonical ticker → benchmark mapping, persisted by the resolver)
CREATE TABLE IF NOT EXISTS symbol_market_resolution (
  raw_symbol          TEXT PRIMARY KEY,
  normalized_symbol   TEXT NOT NULL,
  market_code         TEXT,
  native_currency     TEXT,
  provider_yahoo      TEXT,
  provider_finnhub    TEXT,
  benchmark           TEXT,
  is_index            BOOLEAN DEFAULT false,
  resolved_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index for fast benchmark lookups (used by portfolio_market_framing)
CREATE INDEX IF NOT EXISTS idx_smr_benchmark
  ON symbol_market_resolution (benchmark);

CREATE INDEX IF NOT EXISTS idx_smr_market_code
  ON symbol_market_resolution (market_code);

-- 4. Pre-seed canonical VN / UK / SEA index entries
--    ON CONFLICT DO UPDATE keeps the table idempotent across re-runs
INSERT INTO symbol_market_resolution
  (raw_symbol, normalized_symbol, market_code, native_currency,
   provider_yahoo, provider_finnhub, benchmark, is_index)
VALUES
  ('^VNINDEX', '^VNINDEX', 'GLOBAL_INDEX', 'VND', '^VNINDEX', '^VNINDEX', '^VNINDEX', true),
  ('^VN30',    '^VN30',    'GLOBAL_INDEX', 'VND', '^VN30',    '^VN30',    '^VN30',    true),
  ('^FTSE',    '^FTSE',    'GLOBAL_INDEX', 'GBP', '^FTSE',    '^FTSE',    '^FTSE',    true),
  ('^JKSE',    '^JKSE',    'GLOBAL_INDEX', 'IDR', '^JKSE',    '^JKSE',    '^JKSE',    true),
  ('^SET.BK',  '^SET.BK',  'GLOBAL_INDEX', 'THB', '^SET.BK',  '^SET.BK',  '^SET.BK',  true),
  ('^KLSE',    '^KLSE',    'GLOBAL_INDEX', 'MYR', '^KLSE',    '^KLSE',    '^KLSE',    true),
  ('^STI',     '^STI',     'GLOBAL_INDEX', 'SGD', '^STI',     '^STI',     '^STI',     true),
  ('^GSPC',    '^GSPC',    'GLOBAL_INDEX', 'USD', '^GSPC',    '^GSPC',    '^GSPC',    true),
  ('^N225',    '^N225',    'GLOBAL_INDEX', 'JPY', '^N225',    '^N225',    '^N225',    true),
  ('^HSI',     '^HSI',     'GLOBAL_INDEX', 'HKD', '^HSI',     '^HSI',     '^HSI',     true),
  ('^NSEI',    '^NSEI',    'GLOBAL_INDEX', 'INR', '^NSEI',    '^NSEI',    '^NSEI',    true),
  ('^AXJO',    '^AXJO',    'GLOBAL_INDEX', 'AUD', '^AXJO',    '^AXJO',    '^AXJO',    true)
ON CONFLICT (raw_symbol) DO UPDATE
  SET normalized_symbol = EXCLUDED.normalized_symbol,
      market_code       = EXCLUDED.market_code,
      native_currency   = EXCLUDED.native_currency,
      provider_yahoo    = EXCLUDED.provider_yahoo,
      provider_finnhub  = EXCLUDED.provider_finnhub,
      benchmark         = EXCLUDED.benchmark,
      is_index          = EXCLUDED.is_index,
      resolved_at       = NOW();

-- 5. RLS: allow authenticated and service-role to read / upsert resolver cache
ALTER TABLE symbol_market_resolution ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Authenticated read symbol resolution"
  ON symbol_market_resolution FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY IF NOT EXISTS "Service role upsert symbol resolution"
  ON symbol_market_resolution FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
