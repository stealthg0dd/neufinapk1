# NeuFin — Migration Status

## Summary

| Migration | File | Status | Notes |
|-----------|------|--------|-------|
| v1 | `supabase_migrations.sql` | ✅ Applied | Core tables: `dna_scores`, `user_profiles`, `portfolios`, `portfolio_positions`, `bias_scores`, `sentiment_data`, `trading_signals` |
| v2 | `supabase_migrations_v2.sql` | ✅ Applied | Additional schema updates |
| v3 | `supabase_migrations_v3.sql` | ✅ Applied | Additional schema updates |
| v4 | `supabase_migrations_v4.sql` | ✅ Applied | Additional schema updates |
| v5 | `supabase_migrations_v5.sql` | ✅ Applied | `swarm_reports` table — full schema + RLS + schema-cache reload |
| v6 | `supabase_migrations_v6.sql` | ⬜ **Pending** | `ticker_price_cache` table — price fallback cache |
| v7 | `supabase_migrations_v7.sql` | ⬜ **Pending** | `user_profiles` trial + subscription columns |
| v8 | `supabase_migrations_v8.sql` | ⬜ **Pending** | Fixes `handle_new_user` trigger; adds `subscription_tier`, `stripe_customer_id` |

## How to Apply Pending Migrations

Run `db/apply_pending_migrations.sql` in the Supabase Dashboard:

1. Go to **Dashboard → SQL Editor → New query**
2. Paste the contents of `db/apply_pending_migrations.sql`
3. Click **Run**

The script is **idempotent** — safe to run multiple times.

## Tables Confirmed Present (after v1–v5)

- `public.user_profiles`
- `public.dna_scores`
- `public.portfolios`
- `public.portfolio_positions`
- `public.bias_scores`
- `public.sentiment_data`
- `public.trading_signals`
- `public.swarm_reports`

## Tables Added by Pending Migrations

| Table | Migration | Purpose |
|-------|-----------|---------|
| `public.ticker_price_cache` | v6 | Caches last-known prices for tickers that fail live lookup |

## Columns Added by Pending Migrations

| Table | Column | Migration | Purpose |
|-------|--------|-----------|---------|
| `public.user_profiles` | `trial_started_at` | v7/v8 | Tracks 14-day trial start |
| `public.user_profiles` | `subscription_status` | v7/v8 | `'trial'` \| `'active'` \| `'expired'` \| `'cancelled'` |
| `public.user_profiles` | `subscription_tier` | v8 | `'free'` \| `'pro'` etc. |
| `public.user_profiles` | `stripe_customer_id` | v8 | Stripe customer reference |

## Router Dependencies

| Migration | Required By |
|-----------|-------------|
| v6 `ticker_price_cache` | `routers/portfolio.py` — `verify-prices`, `validate-tickers` endpoints |
| v7/v8 subscription columns | `main.py` `/api/auth/subscription-status`, `routers/payments.py` checkout flow |
| v8 `handle_new_user` trigger | Auth sign-up flow — fixes "Database error saving new user" |
