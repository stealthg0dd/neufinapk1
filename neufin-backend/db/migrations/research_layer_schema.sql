-- ============================================================
-- db/migrations/research_layer_schema.sql
-- NeuFin Market Intelligence Layer — Knowledge Base Schema
-- ============================================================
-- Prerequisites:
--   CREATE EXTENSION IF NOT EXISTS vector;   (pgvector for embeddings)
--   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--
-- Run in Supabase SQL Editor or via psql.
-- RLS enabled on all tables; service role bypasses all policies.

-- ── Extensions ─────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. macro_signals ──────────────────────────────────────────────────────────
-- Structured economic data points from FRED, MAS, World Bank, ECB, IMF.
CREATE TABLE IF NOT EXISTS macro_signals (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type      TEXT        NOT NULL,  -- 'interest_rate','inflation','gdp','employment','currency'
    region           TEXT        NOT NULL,  -- 'US','SEA','SG','CN','EU','GLOBAL'
    source           TEXT        NOT NULL,  -- 'fred','mas','ecb','imf','worldbank'
    title            TEXT,
    value            DECIMAL,
    previous_value   DECIMAL,
    change_pct       DECIMAL,
    signal_date      TIMESTAMPTZ NOT NULL,
    significance     TEXT        CHECK (significance IN ('low','medium','high','critical')),
    raw_data         JSONB,
    embedding        vector(1536),          -- OpenAI text-embedding-3-small
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Deduplicate by source + series + date
CREATE UNIQUE INDEX IF NOT EXISTS macro_signals_source_date_type_uidx
    ON macro_signals (source, signal_type, signal_date);

-- Fast lookups by region and recency
CREATE INDEX IF NOT EXISTS macro_signals_region_date_idx
    ON macro_signals (region, signal_date DESC);

CREATE INDEX IF NOT EXISTS macro_signals_significance_idx
    ON macro_signals (significance, created_at DESC)
    WHERE significance IN ('high', 'critical');

ALTER TABLE macro_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_macro_signals" ON macro_signals
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_macro_signals" ON macro_signals
    FOR SELECT TO anon, authenticated USING (true);

-- ── 2. market_events ──────────────────────────────────────────────────────────
-- Financial news events: earnings, IPOs, regulatory, macro announcements.
CREATE TABLE IF NOT EXISTS market_events (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type       TEXT        NOT NULL,  -- 'earnings','ipo','merger','regulatory','macro','news'
    company_ticker   TEXT,
    company_name     TEXT,
    sector           TEXT,
    region           TEXT,
    title            TEXT        NOT NULL,
    summary          TEXT,
    impact_sentiment TEXT        CHECK (impact_sentiment IN ('very_negative','negative','neutral','positive','very_positive')),
    impact_score     DECIMAL,               -- -1.0 to 1.0
    event_date       TIMESTAMPTZ NOT NULL,
    source_url       TEXT,
    source           TEXT,                  -- 'newsapi','fmp','rss_reuters','rss_bloomberg'
    raw_data         JSONB,
    embedding        vector(1536),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Deduplicate by source_url
CREATE UNIQUE INDEX IF NOT EXISTS market_events_source_url_uidx
    ON market_events (source_url) WHERE source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_events_ticker_date_idx
    ON market_events (company_ticker, event_date DESC)
    WHERE company_ticker IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_events_date_idx
    ON market_events (event_date DESC);

CREATE INDEX IF NOT EXISTS market_events_sector_idx
    ON market_events (sector, event_date DESC)
    WHERE sector IS NOT NULL;

ALTER TABLE market_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_market_events" ON market_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_market_events" ON market_events
    FOR SELECT TO anon, authenticated USING (true);

-- ── 3. research_notes ─────────────────────────────────────────────────────────
-- AI-synthesised research output: macro outlooks, sector analysis, risk alerts.
CREATE TABLE IF NOT EXISTS research_notes (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug              TEXT,
    note_type         TEXT        NOT NULL,  -- 'macro_outlook','sector_analysis','regime_change','risk_alert'
    title             TEXT        NOT NULL,
    executive_summary TEXT        NOT NULL,
    full_content      TEXT        NOT NULL,
    key_findings      JSONB,                 -- [{finding, data_support, implication}]
    affected_sectors  JSONB,                 -- ["Technology","Financials",...]
    affected_tickers  JSONB,                 -- ["AAPL","DBS.SI",...]
    regime            TEXT,                  -- 'risk_on','risk_off','stagflation','recovery','recession'
    time_horizon      TEXT,                  -- 'immediate','1_week','1_month','1_quarter'
    confidence_score  DECIMAL,              -- 0.0 to 1.0
    data_sources      JSONB,                 -- [{source, date, value}]
    generated_by      TEXT,                  -- 'synthesiser','regime_detector','manual'
    generated_at      TIMESTAMPTZ DEFAULT NOW(),
    is_public         BOOL        DEFAULT false,
    embedding         vector(1536)
);

CREATE INDEX IF NOT EXISTS research_notes_generated_at_idx
    ON research_notes (generated_at DESC);

CREATE INDEX IF NOT EXISTS research_notes_public_idx
    ON research_notes (is_public, generated_at DESC)
    WHERE is_public = true;

CREATE INDEX IF NOT EXISTS research_notes_regime_idx
    ON research_notes (regime, generated_at DESC)
    WHERE regime IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS research_notes_slug_idx
    ON research_notes (slug)
    WHERE slug IS NOT NULL;

ALTER TABLE research_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_research_notes" ON research_notes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Public notes visible to all; private notes require auth
CREATE POLICY "read_public_research_notes" ON research_notes
    FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "read_all_research_notes_authenticated" ON research_notes
    FOR SELECT TO authenticated USING (true);

-- ── 4. market_regimes ─────────────────────────────────────────────────────────
-- Historical record of detected market regimes with confidence and signals.
CREATE TABLE IF NOT EXISTS market_regimes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    regime              TEXT        NOT NULL,  -- 'risk_on','risk_off','stagflation','recovery','recession_risk','neutral'
    started_at          TIMESTAMPTZ NOT NULL,
    ended_at            TIMESTAMPTZ,           -- NULL = current regime
    confidence          DECIMAL,               -- 0.0 to 1.0
    supporting_signals  JSONB,                 -- [{signal, value, weight}]
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active regime at a time (ended_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS market_regimes_current_uidx
    ON market_regimes (id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS market_regimes_started_at_idx
    ON market_regimes (started_at DESC);

ALTER TABLE market_regimes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_market_regimes" ON market_regimes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_market_regimes" ON market_regimes
    FOR SELECT TO anon, authenticated USING (true);

-- ── pgvector similarity search functions ───────────────────────────────────────
-- Cosine similarity search across all three embedding tables.
-- Called from research.py query endpoint.

CREATE OR REPLACE FUNCTION search_research_notes(
    query_embedding vector(1536),
    match_count     INT DEFAULT 5,
    min_confidence  FLOAT DEFAULT 0.0
)
RETURNS TABLE (
    id               UUID,
    note_type        TEXT,
    title            TEXT,
    executive_summary TEXT,
    regime           TEXT,
    generated_at     TIMESTAMPTZ,
    is_public        BOOL,
    similarity       FLOAT
)
LANGUAGE sql STABLE AS $$
    SELECT
        id, note_type, title, executive_summary, regime, generated_at, is_public,
        1 - (embedding <=> query_embedding) AS similarity
    FROM research_notes
    WHERE embedding IS NOT NULL
      AND confidence_score >= min_confidence
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION search_macro_signals(
    query_embedding vector(1536),
    match_count     INT DEFAULT 5
)
RETURNS TABLE (
    id           UUID,
    signal_type  TEXT,
    region       TEXT,
    source       TEXT,
    title        TEXT,
    value        DECIMAL,
    signal_date  TIMESTAMPTZ,
    significance TEXT,
    similarity   FLOAT
)
LANGUAGE sql STABLE AS $$
    SELECT
        id, signal_type, region, source, title, value, signal_date, significance,
        1 - (embedding <=> query_embedding) AS similarity
    FROM macro_signals
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION search_market_events(
    query_embedding vector(1536),
    match_count     INT DEFAULT 5
)
RETURNS TABLE (
    id               UUID,
    event_type       TEXT,
    company_ticker   TEXT,
    title            TEXT,
    impact_sentiment TEXT,
    impact_score     DECIMAL,
    event_date       TIMESTAMPTZ,
    similarity       FLOAT
)
LANGUAGE sql STABLE AS $$
    SELECT
        id, event_type, company_ticker, title, impact_sentiment, impact_score, event_date,
        1 - (embedding <=> query_embedding) AS similarity
    FROM market_events
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;
