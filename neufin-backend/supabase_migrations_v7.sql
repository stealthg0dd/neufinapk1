-- 14-day trial and subscription status columns for user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS trial_started_at timestamptz DEFAULT now();
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial';
-- subscription_status values: 'trial' | 'active' | 'expired' | 'cancelled'
