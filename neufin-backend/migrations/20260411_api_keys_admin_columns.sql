-- Optional columns for admin API key management + masked display.
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_prefix TEXT;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'starter';
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS total_calls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.api_keys.key_prefix IS 'First segment of key for display, e.g. nfk_live_ab12';
