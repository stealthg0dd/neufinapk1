-- ============================================================
-- Neufin Production Row Level Security Policies
-- ============================================================
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
--
-- KEY RULE: The backend uses SUPABASE_SERVICE_ROLE_KEY which
-- ALWAYS bypasses RLS. These policies only affect:
--   • Frontend Supabase JS client (anon key)
--   • Direct API calls using the anon key
-- ============================================================


-- ── 1. Enable RLS on all sensitive tables ──────────────────

ALTER TABLE dna_scores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;


-- ── 2. dna_scores ──────────────────────────────────────────

-- Authenticated users can read their own scores
CREATE POLICY "dna_scores: users read own"
  ON dna_scores FOR SELECT
  USING (auth.uid() = user_id);

-- Authenticated users can insert with their user_id
CREATE POLICY "dna_scores: users insert own"
  ON dna_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Public can read a score by share_token (for share page)
-- This replaces direct Supabase client reads; the backend already
-- handles /api/dna/share/{token} via service role, so this is
-- a belt-and-suspenders policy for any direct frontend reads.
CREATE POLICY "dna_scores: public read by share_token"
  ON dna_scores FOR SELECT
  USING (share_token IS NOT NULL);

-- Users can update their own records (e.g. incrementing view_count)
CREATE POLICY "dna_scores: users update own"
  ON dna_scores FOR UPDATE
  USING (auth.uid() = user_id);


-- ── 3. user_profiles ───────────────────────────────────────

-- Users can read any advisor profile (needed for AdvisorCTA public lookup)
CREATE POLICY "user_profiles: public read"
  ON user_profiles FOR SELECT
  USING (true);

-- Users can only insert/update their own profile
CREATE POLICY "user_profiles: users insert own"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles: users update own"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);


-- ── 4. advisor_reports ─────────────────────────────────────

-- Advisors can read their own reports
CREATE POLICY "advisor_reports: advisors read own"
  ON advisor_reports FOR SELECT
  USING (auth.uid()::text = advisor_id);

-- Advisors can update their own reports (e.g. PDF URL)
CREATE POLICY "advisor_reports: advisors update own"
  ON advisor_reports FOR UPDATE
  USING (auth.uid()::text = advisor_id);

-- NOTE: INSERT and DELETE are service-role only (no client-side policy)
-- The backend creates advisor_report records after Stripe payment.


-- ── 5. email_subscribers ───────────────────────────────────

-- Users can manage their own subscription
CREATE POLICY "email_subscribers: users read own"
  ON email_subscribers FOR SELECT
  USING (auth.uid()::text = user_id OR email = auth.email());

CREATE POLICY "email_subscribers: users insert own"
  ON email_subscribers FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR user_id IS NULL);

CREATE POLICY "email_subscribers: users update own"
  ON email_subscribers FOR UPDATE
  USING (auth.uid()::text = user_id OR email = auth.email());


-- ── 6. analytics_events ────────────────────────────────────
-- No RLS needed: write-only for anon (funnel tracking),
-- reads only via service role (admin dashboard).

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone (logged in or not) can insert analytics events
CREATE POLICY "analytics_events: public insert"
  ON analytics_events FOR INSERT
  WITH CHECK (true);

-- No SELECT policy → only service role can query analytics


-- ── 7. Verification queries ────────────────────────────────
-- Run these to confirm RLS is enabled:
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('dna_scores','user_profiles','advisor_reports','email_subscribers','analytics_events');
--
-- Expected: rowsecurity = true for all rows.
--
-- To verify service role bypasses RLS (run as service role):
-- SELECT COUNT(*) FROM dna_scores;  -- should return all rows
