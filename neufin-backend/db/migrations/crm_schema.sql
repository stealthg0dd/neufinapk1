-- ============================================================
-- db/migrations/crm_schema.sql
-- NeuFin CRM — Lead Management
-- ============================================================
-- Run in Supabase SQL Editor or via psql.
-- RLS enabled: admins (service role) can read all rows.
-- Public insert is allowed for lead capture from contact form.

-- ── Enable updated_at auto-update ─────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── leads ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  email            TEXT        NOT NULL UNIQUE,
  company          TEXT,
  role             TEXT,           -- "Independent FA", "Family Office", "Fintech CTO"
  aum_range        TEXT,           -- "<10M", "10-50M", "50-200M", ">200M"
  source           TEXT DEFAULT 'contact_form',
                                   -- "contact_form","linkedin","referral","demo_request"
  status           TEXT DEFAULT 'new'
    CHECK (status IN ('new','contacted','demo_scheduled',
                      'demo_done','proposal_sent','won','lost','nurture')),
  notes            TEXT,
  interested_plan  TEXT,           -- 'advisor', 'enterprise'
  message          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  contacted_at     TIMESTAMPTZ,
  won_at           TIMESTAMPTZ
);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_source    ON leads (source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Allow public INSERT (contact form submissions)
DROP POLICY IF EXISTS "leads_public_insert" ON leads;
CREATE POLICY "leads_public_insert" ON leads
  FOR INSERT WITH CHECK (true);

-- Service role (backend with service_role key) can do anything
DROP POLICY IF EXISTS "leads_service_role_all" ON leads;
CREATE POLICY "leads_service_role_all" ON leads
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Admin flag on user_profiles ────────────────────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_admin BOOL DEFAULT false;

-- ── Comments ───────────────────────────────────────────────────
COMMENT ON TABLE leads IS 'B2B sales pipeline leads captured from contact form, demo requests, and manual entry.';
COMMENT ON COLUMN leads.status IS 'new → contacted → demo_scheduled → demo_done → proposal_sent → won/lost/nurture';
COMMENT ON COLUMN leads.source IS 'Origin of the lead: contact_form, linkedin, referral, demo_request';
