-- ============================================================
-- Migration: Agent Studio custom agents + learning graph events
-- Additive only. Existing Swarm tables and behavior are unchanged.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.custom_agents (
  id UUID PRIMARY KEY,
  user_id UUID NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  parent_agents JSONB NOT NULL DEFAULT '[]',
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  product_flow TEXT,
  inheritance_summary JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_agents_user_id
  ON public.custom_agents (user_id, created_at DESC);

ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_agents_owner_all" ON public.custom_agents;
CREATE POLICY "custom_agents_owner_all"
  ON public.custom_agents
  FOR ALL
  USING (user_id IS NULL OR auth.uid() = user_id)
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_learning_events (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.custom_agents(id) ON DELETE CASCADE,
  user_id UUID NULL,
  event_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  signal TEXT NOT NULL,
  relationship TEXT,
  accuracy_delta NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_learning_events_agent_id
  ON public.agent_learning_events (agent_id, created_at ASC);

ALTER TABLE public.agent_learning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_learning_events_owner_all" ON public.agent_learning_events;
CREATE POLICY "agent_learning_events_owner_all"
  ON public.agent_learning_events
  FOR ALL
  USING (user_id IS NULL OR auth.uid() = user_id)
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
