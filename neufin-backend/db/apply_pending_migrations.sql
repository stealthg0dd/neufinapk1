-- =============================================================================
-- NeuFin — Pending Migrations: v6, v7, v8
-- Generated: 2026-04-03
--
-- Safe to re-run: all DDL uses IF NOT EXISTS / OR REPLACE guards.
-- Apply in Supabase SQL Editor: Dashboard → SQL Editor → New query → Run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- v6: ticker_price_cache — last-known-price fallback for unresolvable tickers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticker_price_cache (
  symbol       text PRIMARY KEY,
  price        numeric(18, 4) NOT NULL,
  source       text,           -- 'live' | 'alias:{ticker}' | 'manual'
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticker_price_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ticker_price_cache'
      AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.ticker_price_cache
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ticker_price_cache'
      AND policyname = 'public_read'
  ) THEN
    CREATE POLICY "public_read" ON public.ticker_price_cache
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ticker_price_cache_symbol ON public.ticker_price_cache (symbol);

-- ---------------------------------------------------------------------------
-- v7: 14-day trial and subscription status columns for user_profiles
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS trial_started_at timestamptz DEFAULT now();
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial';
-- subscription_status values: 'trial' | 'active' | 'expired' | 'cancelled'

-- ---------------------------------------------------------------------------
-- v8: Fix handle_new_user trigger + subscription columns
-- Resolves "Database error saving new user" on sign-up.
-- ---------------------------------------------------------------------------

-- 1. Ensure all required columns exist with proper defaults (idempotent)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS subscription_status  text        NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_tier    text        NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS trial_started_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS stripe_customer_id   text;

-- 2. Replace the trigger function with all required columns.
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

-- =============================================================================
-- End of pending migrations
-- =============================================================================
