-- ============================================================
-- Neufin — Complete Supabase Setup (run in SQL Editor)
-- Drop & recreate all app tables from scratch.
-- Safe to run on a fresh project.
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- for future text search


-- ── user_profiles ─────────────────────────────────────────────
create table if not exists public.user_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  avatar_url    text,
  plan          text not null default 'free',  -- 'free' | 'single' | 'unlimited'
  stripe_customer_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read their own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── portfolios ────────────────────────────────────────────────
create table if not exists public.portfolios (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade,
  name          text not null default 'My Portfolio',
  total_value   numeric(18,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.portfolios enable row level security;

create policy "Users can manage their own portfolios"
  on public.portfolios for all
  using (auth.uid() = user_id);

create index if not exists portfolios_user_id_idx on public.portfolios(user_id);


-- ── portfolio_positions ───────────────────────────────────────
create table if not exists public.portfolio_positions (
  id              uuid primary key default uuid_generate_v4(),
  portfolio_id    uuid not null references public.portfolios(id) on delete cascade,
  symbol          text not null,
  shares          numeric(18,6) not null default 0,
  current_price   numeric(18,4),
  value           numeric(18,2),
  weight_pct      numeric(6,2),
  created_at      timestamptz not null default now()
);

alter table public.portfolio_positions enable row level security;

create policy "Users can manage positions in their portfolios"
  on public.portfolio_positions for all
  using (
    exists (
      select 1 from public.portfolios p
      where p.id = portfolio_id and p.user_id = auth.uid()
    )
  );

create index if not exists positions_portfolio_id_idx on public.portfolio_positions(portfolio_id);


-- ── dna_scores ────────────────────────────────────────────────
create table if not exists public.dna_scores (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users(id) on delete set null,
  portfolio_id    uuid references public.portfolios(id) on delete set null,
  dna_score       integer not null check (dna_score between 0 and 100),
  investor_type   text,
  strengths       text[] default '{}',
  weaknesses      text[] default '{}',
  recommendation  text,
  share_token     text unique not null,
  shared_publicly boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.dna_scores enable row level security;

-- Anyone can read publicly shared scores (leaderboard, share pages)
create policy "Public scores are readable by all"
  on public.dna_scores for select
  using (shared_publicly = true);

-- Authenticated owners can read all their own scores
create policy "Users can read their own scores"
  on public.dna_scores for select
  using (auth.uid() = user_id);

-- Service role (backend) inserts via API key — anon inserts allowed for public DNA endpoint
create policy "Anyone can insert dna scores"
  on public.dna_scores for insert
  with check (true);

create index if not exists dna_scores_user_id_idx    on public.dna_scores(user_id);
create index if not exists dna_scores_share_token_idx on public.dna_scores(share_token);
create index if not exists dna_scores_score_idx       on public.dna_scores(dna_score desc);


-- ── advisor_reports ───────────────────────────────────────────
-- Column names match what payments.py and reports.py actually insert/query
create table if not exists public.advisor_reports (
  id              uuid primary key default uuid_generate_v4(),
  portfolio_id    uuid references public.portfolios(id) on delete set null,
  advisor_id      text,           -- user_id or 'anonymous'
  pdf_url         text,           -- signed or public URL to the PDF
  is_paid         boolean not null default false,
  stripe_session_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.advisor_reports enable row level security;

create policy "Anyone can read advisor reports"
  on public.advisor_reports for select
  using (true);

create policy "Anyone can insert advisor reports"
  on public.advisor_reports for insert
  with check (true);

create policy "Anyone can update advisor reports"
  on public.advisor_reports for update
  using (true);

create index if not exists advisor_reports_advisor_id_idx on public.advisor_reports(advisor_id);
create index if not exists advisor_reports_session_idx    on public.advisor_reports(stripe_session_id);


-- ── analytics_events ──────────────────────────────────────────
create table if not exists public.analytics_events (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  session_id  text,
  event       text not null,
  properties  jsonb default '{}',
  created_at  timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

-- Only backend (service role) should write; no client reads needed
create policy "Anyone can insert analytics events"
  on public.analytics_events for insert
  with check (true);

create index if not exists analytics_event_name_idx on public.analytics_events(event);
create index if not exists analytics_user_id_idx    on public.analytics_events(user_id);
create index if not exists analytics_created_at_idx on public.analytics_events(created_at desc);


-- ── email_subscribers ─────────────────────────────────────────
create table if not exists public.email_subscribers (
  id          uuid primary key default uuid_generate_v4(),
  email       text unique not null,
  user_id     uuid references auth.users(id) on delete set null,
  source      text default 'upload',   -- where they subscribed
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.email_subscribers enable row level security;

create policy "Anyone can subscribe"
  on public.email_subscribers for insert
  with check (true);

create policy "Users can manage their own subscription"
  on public.email_subscribers for all
  using (auth.uid() = user_id);

create index if not exists email_subscribers_email_idx on public.email_subscribers(email);


-- ── referrals (optional — share_token on dna_scores is primary) ─
create table if not exists public.referrals (
  id              uuid primary key default uuid_generate_v4(),
  referrer_token  text not null,     -- dna_scores.share_token of referrer
  referee_email   text,
  discount_applied boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.referrals enable row level security;

create policy "Anyone can insert referrals"
  on public.referrals for insert
  with check (true);

create index if not exists referrals_token_idx on public.referrals(referrer_token);


-- ── Supabase Storage bucket ────────────────────────────────────
-- Run this AFTER enabling Storage extension in your project.
-- Creates the advisor-reports private bucket if it doesn't exist.
insert into storage.buckets (id, name, public)
values ('advisor-reports', 'advisor-reports', false)
on conflict (id) do nothing;

-- Service role can read/write; owners can read their own files
create policy "Authenticated users can upload reports"
  on storage.objects for insert
  with check (bucket_id = 'advisor-reports' and auth.role() = 'authenticated');

create policy "Users can read their own report files"
  on storage.objects for select
  using (bucket_id = 'advisor-reports' and auth.uid()::text = (storage.foldername(name))[1]);


-- ── Helpful views ──────────────────────────────────────────────
create or replace view public.leaderboard as
  select
    id,
    dna_score,
    investor_type,
    share_token,
    created_at
  from public.dna_scores
  where shared_publicly = true
  order by dna_score desc, created_at desc;

-- Done — all tables, indexes, RLS policies, and storage bucket created.
