-- ── Guest session tracking for claim flow ─────────────────────────────────────
-- Adds session_id to portfolios, dna_scores, and swarm_reports so that
-- anonymous (guest) records can be bulk-reassigned when a user registers.
--
-- Client sets localStorage.setItem('neufin-session-id', crypto.randomUUID())
-- before any upload/swarm run, and sends it in every create/generate API call.
-- After signup, client calls POST /api/vault/claim-session with the session_id.

-- portfolios
ALTER TABLE portfolios     ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE dna_scores     ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE swarm_reports  ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Indexes for the WHERE session_id = ? AND user_id IS NULL query
CREATE INDEX IF NOT EXISTS idx_portfolios_session_id    ON portfolios    (session_id) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_dna_scores_session_id    ON dna_scores    (session_id) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_swarm_reports_session_id ON swarm_reports (session_id) WHERE user_id IS NULL;


-- ── QQQ benchmark column for stress results ───────────────────────────────────
-- swarm_reports.agent_trace is JSONB; no schema change needed —
-- stress_results are embedded inside the JSONB blob.
-- No migration required for the benchmark data itself.


-- ── has_paid_report flag on dna_scores ────────────────────────────────────────
-- Used by PaywallOverlay to determine if the Risk Matrix / Tax Directive
-- sections should be unlocked without re-calling Stripe.
ALTER TABLE dna_scores ADD COLUMN IF NOT EXISTS has_paid_report BOOLEAN DEFAULT FALSE;
ALTER TABLE swarm_reports ADD COLUMN IF NOT EXISTS has_paid_report BOOLEAN DEFAULT FALSE;

-- Webhook handler (payments router) sets has_paid_report = TRUE on checkout.session.completed
-- UPDATE swarm_reports SET has_paid_report = TRUE WHERE id = <report_id>;
