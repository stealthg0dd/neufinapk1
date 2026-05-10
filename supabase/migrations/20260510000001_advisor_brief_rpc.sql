-- RPC for advisor daily brief engine — latest DNA per primary client portfolio,
-- score delta vs prior snapshot, churn from latest behavioral alert, review cadence.

CREATE OR REPLACE FUNCTION public.get_advisor_clients_with_latest_scores(
  p_advisor_id uuid
)
RETURNS TABLE (
  id uuid,
  client_name text,
  risk_profile text,
  client_portfolio_id uuid,
  dna_score integer,
  churn_risk_level text,
  score_date timestamptz,
  score_delta integer,
  days_since_review integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ordered_snapshots AS (
    SELECT
      dss.client_portfolio_id,
      dss.dna_score,
      dss.created_at,
      (dss.dna_score - LAG(dss.dna_score) OVER (
        PARTITION BY dss.client_portfolio_id
        ORDER BY dss.created_at ASC
      ))::integer AS score_delta
    FROM public.dna_score_snapshots dss
    INNER JOIN public.client_portfolios cp
      ON cp.id = dss.client_portfolio_id
      AND cp.advisor_id = p_advisor_id
  ),
  latest_snap AS (
    SELECT DISTINCT ON (os.client_portfolio_id)
      os.client_portfolio_id,
      os.dna_score,
      os.created_at AS score_date,
      os.score_delta
    FROM ordered_snapshots os
    ORDER BY os.client_portfolio_id, os.created_at DESC
  ),
  primary_cp AS (
    SELECT DISTINCT ON (cp.client_id)
      cp.id AS cp_id,
      cp.client_id
    FROM public.client_portfolios cp
    WHERE cp.advisor_id = p_advisor_id
    ORDER BY cp.client_id, cp.created_at ASC
  )
  SELECT
    ac.id,
    ac.display_name AS client_name,
    COALESCE(NULLIF(trim(ac.metadata ->> 'risk_profile'), ''), '') AS risk_profile,
    pc.cp_id AS client_portfolio_id,
    ls.dna_score,
    COALESCE(al.lvl, 'LOW') AS churn_risk_level,
    ls.score_date,
    ls.score_delta,
    CASE
      WHEN NULLIF(trim(ac.metadata ->> 'last_review_at'), '') IS NOT NULL
        THEN EXTRACT(
          DAY FROM (
            timezone('utc', now())
            - (NULLIF(trim(ac.metadata ->> 'last_review_at'), ''))::timestamptz
          )
        )::integer
      WHEN ls.score_date IS NOT NULL
        THEN EXTRACT(
          DAY FROM (timezone('utc', now()) - ls.score_date)
        )::integer
      ELSE NULL::integer
    END AS days_since_review
  FROM public.advisor_clients ac
  LEFT JOIN primary_cp pc ON pc.client_id = ac.id
  LEFT JOIN latest_snap ls ON ls.client_portfolio_id = pc.cp_id
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN lower(ba.severity) IN ('critical', 'high') THEN 'HIGH'
      WHEN lower(ba.severity) = 'medium' THEN 'MEDIUM'
      ELSE 'LOW'
    END AS lvl
    FROM public.behavioral_alerts ba
    WHERE ba.client_id = ac.id
      AND ba.advisor_id = p_advisor_id
    ORDER BY ba.created_at DESC
    LIMIT 1
  ) AS al ON TRUE
  WHERE ac.advisor_id = p_advisor_id
  ORDER BY
    CASE COALESCE(al.lvl, 'LOW')
      WHEN 'HIGH' THEN 1
      WHEN 'MEDIUM' THEN 2
      ELSE 3
    END,
    ls.score_date ASC NULLS LAST;
$$;

COMMENT ON FUNCTION public.get_advisor_clients_with_latest_scores(uuid) IS
  'Advisor client book row with latest DNA snapshot, delta, churn from alerts, review age.';

GRANT EXECUTE ON FUNCTION public.get_advisor_clients_with_latest_scores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_advisor_clients_with_latest_scores(uuid) TO service_role;
