-- Persist generated meeting prep briefs on client_meetings rows.

ALTER TABLE public.client_meetings
  ADD COLUMN IF NOT EXISTS prep_brief_json jsonb;

ALTER TABLE public.client_meetings
  ADD COLUMN IF NOT EXISTS prep_status text NOT NULL DEFAULT 'draft';

COMMENT ON COLUMN public.client_meetings.prep_brief_json IS
  'Structured 1-page prep output (sections A–F) plus metadata for advisor review.';

COMMENT ON COLUMN public.client_meetings.prep_status IS
  'draft | saved | used — lifecycle for prep brief consumption.';
