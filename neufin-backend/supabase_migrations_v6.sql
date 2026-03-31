-- v6: ticker_price_cache — last-known-price fallback for unresolvable tickers

CREATE TABLE IF NOT EXISTS public.ticker_price_cache (
  symbol       text PRIMARY KEY,
  price        numeric(18, 4) NOT NULL,
  source       text,           -- 'live' | 'alias:{ticker}' | 'manual'
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

-- Allow the backend service role to read/write
ALTER TABLE public.ticker_price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.ticker_price_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon/authenticated to read (prices are not sensitive)
CREATE POLICY "public_read" ON public.ticker_price_cache
  FOR SELECT TO anon, authenticated USING (true);

-- Index for fast single-symbol lookup (covered by PK, but be explicit)
CREATE INDEX IF NOT EXISTS idx_ticker_price_cache_symbol ON public.ticker_price_cache (symbol);
