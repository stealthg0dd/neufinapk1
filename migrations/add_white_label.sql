-- ============================================================
-- Migration: Add white-label / onboarding columns to user_profiles
-- Run this in the Supabase SQL Editor (Project → SQL → New query)
-- ============================================================

-- 1. Add new columns (all idempotent with IF NOT EXISTS)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS firm_name             TEXT,
  ADD COLUMN IF NOT EXISTS firm_logo_url         TEXT,
  ADD COLUMN IF NOT EXISTS advisor_name          TEXT,
  ADD COLUMN IF NOT EXISTS advisor_email         TEXT,
  ADD COLUMN IF NOT EXISTS white_label_enabled   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_primary_color   TEXT    DEFAULT '#1EB8CC',
  ADD COLUMN IF NOT EXISTS onboarding_completed  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_type             TEXT;   -- retail | advisor | pm | enterprise

-- 2. Existing users: mark onboarding as already completed so they are not
--    bounced into the onboarding flow after the migration.
UPDATE user_profiles
SET onboarding_completed = true
WHERE onboarding_completed IS NULL
   OR onboarding_completed = false;

-- 3. Create the firm-logos storage bucket (public — logos must be accessible
--    from PDF generation workers without auth headers).
-- Run manually in the Supabase Dashboard → Storage → New bucket if the SQL
-- INSERT below fails because of the GUI restriction.
INSERT INTO storage.buckets (id, name, public)
VALUES ('firm-logos', 'firm-logos', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage RLS: allow authenticated users to upload their own logo.
--    The folder structure is {user_id}/{filename} so users can only write
--    their own sub-folder.
CREATE POLICY IF NOT EXISTS "Users upload own logo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'firm-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY IF NOT EXISTS "Public read firm logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'firm-logos');

CREATE POLICY IF NOT EXISTS "Users delete own logo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'firm-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
