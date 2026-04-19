-- # SEA-TICKER-FIX: symbol resolution cache + optional portfolio position metadata (idempotent).

create table if not exists public.symbol_market_resolution (
  raw_symbol text primary key,
  normalized_symbol text not null,
  market_code text,
  native_currency text,
  provider_yahoo text,
  provider_finnhub text,
  benchmark text,
  is_index boolean default false,
  updated_at timestamptz not null default now()
);

alter table public.portfolio_positions
  add column if not exists native_currency text;

alter table public.portfolio_positions
  add column if not exists market_code text;

alter table public.portfolio_positions
  add column if not exists provider_ticker text;

create index if not exists symbol_market_resolution_market_idx
  on public.symbol_market_resolution (market_code);
