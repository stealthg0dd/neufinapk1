-- Client communication studio — lifecycle and classification on client_communications.

ALTER TABLE public.client_communications
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

ALTER TABLE public.client_communications
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

ALTER TABLE public.client_communications
  ADD COLUMN IF NOT EXISTS compliance_status text;

ALTER TABLE public.client_communications
  ADD COLUMN IF NOT EXISTS communication_type text;

COMMENT ON COLUMN public.client_communications.status IS
  'draft | approved | sent - NeuFin never auto-sends; advisor sends externally.';

COMMENT ON COLUMN public.client_communications.communication_type IS
  'email | whatsapp | pdf | talking_points';
