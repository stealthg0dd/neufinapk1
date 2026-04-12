-- advisors.brand_color — used by API/reporting parity with user_profiles.brand_primary_color
-- Idempotent: safe to re-run.

ALTER TABLE public.advisors
  ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#1EB8CC';

COMMENT ON COLUMN public.advisors.brand_color IS
  'Accent hex; mirrors user_profiles.brand_primary_color when set.';

-- Keep existing advisor rows aligned with profile brand (if any).
UPDATE public.advisors AS a
SET brand_color = COALESCE(
  NULLIF(btrim(p.brand_primary_color::text), ''),
  '#1EB8CC'
)
FROM public.user_profiles AS p
WHERE p.id = a.id;
