-- ============================================================
-- v10 advisor platform — same content as pack name v10_advisor_platform.sql
-- (Supabase CLI requires <timestamp>_name.sql; this is the canonical file.)
-- v10 — Advisor platform foundation (additive only)
-- New CRM-style tables keyed by advisor_id (= auth.uid() for RLS).
-- No FK to user_profiles(id) — avoids legacy drift; advisor_id is UUID.
-- ============================================================

CREATE OR REPLACE FUNCTION public.advisor_platform_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── advisor_clients ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.advisor_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL,
  display_name text NOT NULL,
  email text,
  company text,
  phone text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advisor_clients_advisor_id
  ON public.advisor_clients (advisor_id);

COMMENT ON TABLE public.advisor_clients IS
  'CRM clients owned by an advisor (advisor_id = auth.uid() under RLS).';

-- ── client_portfolios ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.advisor_clients (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Portfolio',
  description text,
  base_portfolio_id uuid REFERENCES public.portfolios (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_portfolios_advisor_id
  ON public.client_portfolios (advisor_id);
CREATE INDEX IF NOT EXISTS idx_client_portfolios_client_id
  ON public.client_portfolios (client_id);

COMMENT ON TABLE public.client_portfolios IS
  'Named portfolios for an advisor client; optional link to existing portfolios row.';

-- ── portfolio_snapshots ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL,
  client_portfolio_id uuid NOT NULL REFERENCES public.client_portfolios (id) ON DELETE CASCADE,
  snapshot_kind text NOT NULL DEFAULT 'manual',
  positions jsonb,
  metrics jsonb,
  total_value numeric(18, 2),
  currency text DEFAULT 'USD',
  as_of timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_advisor_id
  ON public.portfolio_snapshots (advisor_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_client_portfolio_id
  ON public.portfolio_snapshots (client_portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_as_of
  ON public.portfolio_snapshots (as_of DESC);

COMMENT ON TABLE public.portfolio_snapshots IS
  'Point-in-time holdings/metrics for a client portfolio.';

-- ── dna_score_snapshots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dna_score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL,
  client_portfolio_id uuid REFERENCES public.client_portfolios (id) ON DELETE SET NULL,
  dna_score integer,
  investor_type text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_run_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dna_score_snapshots_advisor_id
  ON public.dna_score_snapshots (advisor_id);
CREATE INDEX IF NOT EXISTS idx_dna_score_snapshots_client_portfolio_id
  ON public.dna_score_snapshots (client_portfolio_id);

COMMENT ON TABLE public.dna_score_snapshots IS
  'Historical DNA score captures for advisor client portfolios.';

-- ── behavioral_alerts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.behavioral_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.advisor_clients (id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_behavioral_alerts_advisor_id
  ON public.behavioral_alerts (advisor_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_alerts_client_id
  ON public.behavioral_alerts (client_id);

COMMENT ON TABLE public.behavioral_alerts IS
  'Alerts surfaced to an advisor about a specific client.';

-- ── client_meetings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.advisor_clients (id) ON DELETE CASCADE,
  title text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer DEFAULT 30,
  location text,
  notes text,
  meeting_type text DEFAULT 'review',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_meetings_advisor_id
  ON public.client_meetings (advisor_id);
CREATE INDEX IF NOT EXISTS idx_client_meetings_client_id
  ON public.client_meetings (client_id);
CREATE INDEX IF NOT EXISTS idx_client_meetings_scheduled_at
  ON public.client_meetings (scheduled_at);

COMMENT ON TABLE public.client_meetings IS
  'Scheduled meetings between advisor and client.';

-- ── client_communications ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.advisor_clients (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'note',
  subject text,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_comms_advisor_id
  ON public.client_communications (advisor_id);
CREATE INDEX IF NOT EXISTS idx_client_comms_client_id
  ON public.client_communications (client_id);

COMMENT ON TABLE public.client_communications IS
  'Notes, calls, emails, and other touchpoints with a client.';

-- ── connected_accounts (Plaid-ready; not wired in app yet) ─
CREATE TABLE IF NOT EXISTS public.connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL,
  client_id uuid REFERENCES public.advisor_clients (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'plaid',
  provider_item_id text,
  institution_name text,
  mask_last4 text,
  status text NOT NULL DEFAULT 'pending',
  scopes jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_advisor_id
  ON public.connected_accounts (advisor_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_client_id
  ON public.connected_accounts (client_id);

COMMENT ON TABLE public.connected_accounts IS
  'Future bank/broker connections (e.g. Plaid); advisor-scoped.';

-- ── updated_at triggers ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_advisor_clients_updated_at ON public.advisor_clients;
CREATE TRIGGER trg_advisor_clients_updated_at
  BEFORE UPDATE ON public.advisor_clients
  FOR EACH ROW EXECUTE FUNCTION public.advisor_platform_touch_updated_at();

DROP TRIGGER IF EXISTS trg_client_portfolios_updated_at ON public.client_portfolios;
CREATE TRIGGER trg_client_portfolios_updated_at
  BEFORE UPDATE ON public.client_portfolios
  FOR EACH ROW EXECUTE FUNCTION public.advisor_platform_touch_updated_at();

DROP TRIGGER IF EXISTS trg_behavioral_alerts_updated_at ON public.behavioral_alerts;
CREATE TRIGGER trg_behavioral_alerts_updated_at
  BEFORE UPDATE ON public.behavioral_alerts
  FOR EACH ROW EXECUTE FUNCTION public.advisor_platform_touch_updated_at();

DROP TRIGGER IF EXISTS trg_client_meetings_updated_at ON public.client_meetings;
CREATE TRIGGER trg_client_meetings_updated_at
  BEFORE UPDATE ON public.client_meetings
  FOR EACH ROW EXECUTE FUNCTION public.advisor_platform_touch_updated_at();

DROP TRIGGER IF EXISTS trg_connected_accounts_updated_at ON public.connected_accounts;
CREATE TRIGGER trg_connected_accounts_updated_at
  BEFORE UPDATE ON public.connected_accounts
  FOR EACH ROW EXECUTE FUNCTION public.advisor_platform_touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE public.advisor_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dna_score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavioral_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

-- advisor_clients policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'advisor_clients' AND policyname = 'advisor_clients_select_own') THEN
    CREATE POLICY advisor_clients_select_own ON public.advisor_clients FOR SELECT USING (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'advisor_clients' AND policyname = 'advisor_clients_insert_own') THEN
    CREATE POLICY advisor_clients_insert_own ON public.advisor_clients FOR INSERT WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'advisor_clients' AND policyname = 'advisor_clients_update_own') THEN
    CREATE POLICY advisor_clients_update_own ON public.advisor_clients FOR UPDATE USING (advisor_id = auth.uid()) WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'advisor_clients' AND policyname = 'advisor_clients_delete_own') THEN
    CREATE POLICY advisor_clients_delete_own ON public.advisor_clients FOR DELETE USING (advisor_id = auth.uid());
  END IF;
END $$;

-- client_portfolios policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_portfolios' AND policyname = 'client_portfolios_select_own') THEN
    CREATE POLICY client_portfolios_select_own ON public.client_portfolios FOR SELECT USING (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_portfolios' AND policyname = 'client_portfolios_insert_own') THEN
    CREATE POLICY client_portfolios_insert_own ON public.client_portfolios FOR INSERT WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_portfolios' AND policyname = 'client_portfolios_update_own') THEN
    CREATE POLICY client_portfolios_update_own ON public.client_portfolios FOR UPDATE USING (advisor_id = auth.uid()) WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_portfolios' AND policyname = 'client_portfolios_delete_own') THEN
    CREATE POLICY client_portfolios_delete_own ON public.client_portfolios FOR DELETE USING (advisor_id = auth.uid());
  END IF;
END $$;

-- portfolio_snapshots policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'portfolio_snapshots' AND policyname = 'portfolio_snapshots_select_own') THEN
    CREATE POLICY portfolio_snapshots_select_own ON public.portfolio_snapshots FOR SELECT USING (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'portfolio_snapshots' AND policyname = 'portfolio_snapshots_insert_own') THEN
    CREATE POLICY portfolio_snapshots_insert_own ON public.portfolio_snapshots FOR INSERT WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'portfolio_snapshots' AND policyname = 'portfolio_snapshots_update_own') THEN
    CREATE POLICY portfolio_snapshots_update_own ON public.portfolio_snapshots FOR UPDATE USING (advisor_id = auth.uid()) WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'portfolio_snapshots' AND policyname = 'portfolio_snapshots_delete_own') THEN
    CREATE POLICY portfolio_snapshots_delete_own ON public.portfolio_snapshots FOR DELETE USING (advisor_id = auth.uid());
  END IF;
END $$;

-- dna_score_snapshots policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dna_score_snapshots' AND policyname = 'dna_score_snapshots_select_own') THEN
    CREATE POLICY dna_score_snapshots_select_own ON public.dna_score_snapshots FOR SELECT USING (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dna_score_snapshots' AND policyname = 'dna_score_snapshots_insert_own') THEN
    CREATE POLICY dna_score_snapshots_insert_own ON public.dna_score_snapshots FOR INSERT WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dna_score_snapshots' AND policyname = 'dna_score_snapshots_update_own') THEN
    CREATE POLICY dna_score_snapshots_update_own ON public.dna_score_snapshots FOR UPDATE USING (advisor_id = auth.uid()) WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dna_score_snapshots' AND policyname = 'dna_score_snapshots_delete_own') THEN
    CREATE POLICY dna_score_snapshots_delete_own ON public.dna_score_snapshots FOR DELETE USING (advisor_id = auth.uid());
  END IF;
END $$;

-- behavioral_alerts policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'behavioral_alerts' AND policyname = 'behavioral_alerts_select_own') THEN
    CREATE POLICY behavioral_alerts_select_own ON public.behavioral_alerts FOR SELECT USING (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'behavioral_alerts' AND policyname = 'behavioral_alerts_insert_own') THEN
    CREATE POLICY behavioral_alerts_insert_own ON public.behavioral_alerts FOR INSERT WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'behavioral_alerts' AND policyname = 'behavioral_alerts_update_own') THEN
    CREATE POLICY behavioral_alerts_update_own ON public.behavioral_alerts FOR UPDATE USING (advisor_id = auth.uid()) WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'behavioral_alerts' AND policyname = 'behavioral_alerts_delete_own') THEN
    CREATE POLICY behavioral_alerts_delete_own ON public.behavioral_alerts FOR DELETE USING (advisor_id = auth.uid());
  END IF;
END $$;

-- client_meetings policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_meetings' AND policyname = 'client_meetings_select_own') THEN
    CREATE POLICY client_meetings_select_own ON public.client_meetings FOR SELECT USING (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_meetings' AND policyname = 'client_meetings_insert_own') THEN
    CREATE POLICY client_meetings_insert_own ON public.client_meetings FOR INSERT WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_meetings' AND policyname = 'client_meetings_update_own') THEN
    CREATE POLICY client_meetings_update_own ON public.client_meetings FOR UPDATE USING (advisor_id = auth.uid()) WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_meetings' AND policyname = 'client_meetings_delete_own') THEN
    CREATE POLICY client_meetings_delete_own ON public.client_meetings FOR DELETE USING (advisor_id = auth.uid());
  END IF;
END $$;

-- client_communications policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_communications' AND policyname = 'client_communications_select_own') THEN
    CREATE POLICY client_communications_select_own ON public.client_communications FOR SELECT USING (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_communications' AND policyname = 'client_communications_insert_own') THEN
    CREATE POLICY client_communications_insert_own ON public.client_communications FOR INSERT WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_communications' AND policyname = 'client_communications_update_own') THEN
    CREATE POLICY client_communications_update_own ON public.client_communications FOR UPDATE USING (advisor_id = auth.uid()) WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_communications' AND policyname = 'client_communications_delete_own') THEN
    CREATE POLICY client_communications_delete_own ON public.client_communications FOR DELETE USING (advisor_id = auth.uid());
  END IF;
END $$;

-- connected_accounts policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'connected_accounts' AND policyname = 'connected_accounts_select_own') THEN
    CREATE POLICY connected_accounts_select_own ON public.connected_accounts FOR SELECT USING (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'connected_accounts' AND policyname = 'connected_accounts_insert_own') THEN
    CREATE POLICY connected_accounts_insert_own ON public.connected_accounts FOR INSERT WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'connected_accounts' AND policyname = 'connected_accounts_update_own') THEN
    CREATE POLICY connected_accounts_update_own ON public.connected_accounts FOR UPDATE USING (advisor_id = auth.uid()) WITH CHECK (advisor_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'connected_accounts' AND policyname = 'connected_accounts_delete_own') THEN
    CREATE POLICY connected_accounts_delete_own ON public.connected_accounts FOR DELETE USING (advisor_id = auth.uid());
  END IF;
END $$;
