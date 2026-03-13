-- ── Analytics funnel events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name  TEXT        NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id  TEXT,
  properties  JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events (event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id    ON analytics_events (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events (created_at DESC);

-- ── Referrals ───────────────────────────────────────────────────────────────────
-- Each user gets a referral token (their share_token reused, or a separate one).
-- When someone checks out using ?ref=<token>, we log it here and apply a Stripe coupon.
CREATE TABLE IF NOT EXISTS referrals (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ref_token        TEXT        UNIQUE NOT NULL,
  referrer_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  referrer_share_token TEXT,   -- dna_scores.share_token of the referrer
  uses             INT         DEFAULT 0,
  discount_pct     INT         DEFAULT 20,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_token ON referrals (ref_token);

-- ── Weekly digest subscriptions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_subscribers (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL UNIQUE,
  subscribed BOOLEAN     DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Enable RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE analytics_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_subscribers  ENABLE ROW LEVEL SECURITY;

-- Service role can read/write everything (bypasses RLS).
-- No public read access to analytics or referrals.
