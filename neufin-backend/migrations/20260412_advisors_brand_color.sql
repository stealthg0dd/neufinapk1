-- Optional: aligns advisors with code paths that reference brand_color.
-- The app stores the canonical color on user_profiles.brand_primary_color;
-- run this if you want advisors.brand_color for SQL/reporting parity.

ALTER TABLE advisors
  ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#1EB8CC';

COMMENT ON COLUMN advisors.brand_color IS
  'Accent hex; optional duplicate of user_profiles.brand_primary_color.';
