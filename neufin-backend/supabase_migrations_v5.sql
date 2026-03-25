-- ── Migration v5: swarm_reports — full schema + RLS + schema-cache reload ──────
--
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Fixes:
--   • PGRST205 "Could not find table public.swarm_reports in the schema cache"
--   • Adds every column the backend currently inserts so no implicit-cast errors
--   • Enables RLS with policies for service_role bypass, authenticated users,
--     and anonymous (guest) inserts where user_id IS NULL
--   • Issues NOTIFY pgrst, 'reload schema' at the end to flush PostgREST cache

-- ── 1. Create table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.swarm_reports (
  -- identity
  id                   TEXT        PRIMARY KEY,        -- supplied by backend (UUID string)
  user_id              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id           TEXT,                           -- guest session token (no auth)

  -- core thesis fields
  dna_score            INTEGER,
  headline             TEXT,
  briefing             TEXT,
  top_risks            JSONB       DEFAULT '[]',
  macro_advice         TEXT,
  tax_recommendation   TEXT,
  stress_results       JSONB       DEFAULT '{}',
  risk_factors         JSONB       DEFAULT '[]',
  score_breakdown      JSONB       DEFAULT '{}',

  -- quantitative metrics
  weighted_beta        NUMERIC,
  sharpe_ratio         NUMERIC,
  regime               TEXT,

  -- agent execution log
  agent_trace          JSONB       DEFAULT '[]',

  -- payment gate
  has_paid_report      BOOLEAN     DEFAULT FALSE,

  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_swarm_reports_user_id
  ON public.swarm_reports (user_id);

CREATE INDEX IF NOT EXISTS idx_swarm_reports_created_at
  ON public.swarm_reports (created_at DESC);

-- Partial index: speeds up guest-session claim queries
CREATE INDEX IF NOT EXISTS idx_swarm_reports_session_id
  ON public.swarm_reports (session_id)
  WHERE user_id IS NULL;

-- ── 3. Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.swarm_reports ENABLE ROW LEVEL SECURITY;

-- Service role (used by the Railway backend) bypasses RLS entirely.
-- Policies below apply to the anon / authenticated roles only.

-- Policy A: authenticated users can read/update their own reports
DROP POLICY IF EXISTS "swarm_own" ON public.swarm_reports;
CREATE POLICY "swarm_reports: owner full access"
  ON public.swarm_reports
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy B: allow anonymous inserts (user_id IS NULL — guest swarm runs)
-- The backend writes these with the service_role key, but this policy covers
-- any path where only the anon key is available (e.g. local dev without
-- SUPABASE_SERVICE_ROLE_KEY set).
CREATE POLICY IF NOT EXISTS "swarm_reports: anon insert guest"
  ON public.swarm_reports
  FOR INSERT
  WITH CHECK (user_id IS NULL);

-- Policy C: allow read of own guest reports by session_id match
-- (Useful if you ever query swarm_reports from the frontend directly)
CREATE POLICY IF NOT EXISTS "swarm_reports: session read"
  ON public.swarm_reports
  FOR SELECT
  USING (
    -- authenticated owner
    auth.uid() = user_id
    OR
    -- unauthenticated but same session
    (user_id IS NULL AND session_id IS NOT NULL)
  );

-- ── 4. Back-fill missing columns on an existing table ─────────────────────────
-- Safe to run even if the table already existed with a partial schema.
ALTER TABLE public.swarm_reports ADD COLUMN IF NOT EXISTS briefing           TEXT;
ALTER TABLE public.swarm_reports ADD COLUMN IF NOT EXISTS stress_results     JSONB    DEFAULT '{}';
ALTER TABLE public.swarm_reports ADD COLUMN IF NOT EXISTS risk_factors       JSONB    DEFAULT '[]';
ALTER TABLE public.swarm_reports ADD COLUMN IF NOT EXISTS score_breakdown    JSONB    DEFAULT '{}';
ALTER TABLE public.swarm_reports ADD COLUMN IF NOT EXISTS weighted_beta      NUMERIC;
ALTER TABLE public.swarm_reports ADD COLUMN IF NOT EXISTS sharpe_ratio       NUMERIC;
ALTER TABLE public.swarm_reports ADD COLUMN IF NOT EXISTS regime             TEXT;
ALTER TABLE public.swarm_reports ADD COLUMN IF NOT EXISTS session_id         TEXT;
ALTER TABLE public.swarm_reports ADD COLUMN IF NOT EXISTS has_paid_report    BOOLEAN  DEFAULT FALSE;

-- ── 5. Force PostgREST to reload its schema cache ──────────────────────────────
-- This eliminates the PGRST205 "table not found in schema cache" error
-- immediately without needing to restart the Supabase project.
NOTIFY pgrst, 'reload schema';
