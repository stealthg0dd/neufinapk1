-- PROMPT 32 — Step 1: onboarding gate on user_profiles (Supabase SQL Editor)
-- White-label fields live in the existing `advisors` table in your project.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Existing accounts: skip forced onboarding
UPDATE user_profiles
SET onboarding_completed = true
WHERE created_at < NOW() - INTERVAL '1 day';
