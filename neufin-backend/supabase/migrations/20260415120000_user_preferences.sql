-- User preferences (quant analytical objectives, etc.)
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  quant_models jsonb not null default '["institutional"]'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.user_preferences is 'Per-user UI preferences; quant_models stores selected financial objective mode ids.';

alter table public.user_preferences enable row level security;

create policy "user_preferences: users read own"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "user_preferences: users insert own"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "user_preferences: users update own"
  on public.user_preferences for update
  using (auth.uid() = user_id);
