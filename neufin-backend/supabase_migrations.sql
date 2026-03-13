-- Run these in your Supabase SQL editor
-- Existing tables (user_profiles, portfolios, portfolio_positions,
-- bias_scores, sentiment_data, trading_signals) are already present.

CREATE TABLE IF NOT EXISTS dna_scores (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id  UUID        REFERENCES portfolios(id) ON DELETE SET NULL,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  dna_score     INT         CHECK (dna_score BETWEEN 0 AND 100),
  investor_type TEXT,
  strengths     TEXT[],
  weaknesses    TEXT[],
  recommendation TEXT,
  share_token   TEXT        UNIQUE,
  view_count    INT         DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advisor_reports (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID        REFERENCES portfolios(id) ON DELETE SET NULL,
  advisor_id   UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  pdf_url      TEXT,
  is_paid      BOOLEAN     DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dna_scores_share_token  ON dna_scores (share_token);
CREATE INDEX IF NOT EXISTS idx_dna_scores_portfolio_id ON dna_scores (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_advisor_reports_advisor ON advisor_reports (advisor_id);
