-- ============================================================
-- v8 — Fix handle_new_user trigger + subscription columns
-- Resolves "Database error saving new user" on sign-up.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Ensure columns exist with defaults (idempotent)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS subscription_status  text        NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_tier    text        NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS trial_started_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS stripe_customer_id   text;

-- 2. Replace the trigger function to include all required columns.
--    SECURITY DEFINER + search_path=public bypasses RLS so it can insert
--    even when the INSERT policy isn't satisfied by auth.uid() at trigger time.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    subscription_status,
    subscription_tier,
    trial_started_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    'trial',
    'free',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Re-create the trigger (drop first to guarantee clean state)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Ensure INSERT policy exists so service_role + anon sign-up works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_profiles'
      AND policyname = 'user_profiles: service_role insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "user_profiles: service_role insert"
        ON public.user_profiles
        FOR INSERT
        WITH CHECK (true);
    $policy$;
  END IF;
END
$$;
