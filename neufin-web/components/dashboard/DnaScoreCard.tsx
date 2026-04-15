"use client";

interface Props {
  score: number | null;
  investorType: string | null;
  hasPortfolio: boolean;
}

function scoreColor(s: number | null) {
  if (s == null) return "#64748B";
  if (s >= 71) return "#16A34A";
  if (s >= 41) return "#d97706";
  return "#DC2626";
}

function scoreLabel(s: number | null) {
  if (s == null) return "—";
  if (s >= 71) return "Healthy";
  if (s >= 41) return "At Risk";
  return "Critical";
}

export function DnaScoreCard({ score, investorType, hasPortfolio }: Props) {
  const col = scoreColor(score);
  const label = scoreLabel(score);

  return (
    <div className="card-elevated flex flex-col gap-1">
      <div className="text-label text-primary">PORTFOLIO HEALTH</div>

      {hasPortfolio && score != null ? (
        <>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span
              className="text-[42px] font-bold leading-none tabular-nums"
              style={{ color: col }}
            >
              {score}
            </span>
            <span className="text-sm font-semibold" style={{ color: col }}>
              {label}
            </span>
          </div>
          <p className="mt-1 text-body-sm text-slate-600">
            DNA Score · {investorType ?? "Portfolio Investor"}
          </p>
        </>
      ) : (
        <>
          <div className="mt-2 text-[32px] font-semibold text-slate-300">—</div>
          <p className="mt-1 text-body-sm text-slate-600">
            {hasPortfolio
              ? "Analysis pending"
              : "Upload a portfolio to see your score"}
          </p>
        </>
      )}
    </div>
  );
}
