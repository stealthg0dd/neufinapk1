"use client";

interface Props {
  totalValue: number | null | undefined;
  numPositions?: number;
  hasPortfolio: boolean;
}

function formatValue(v: number | null | undefined) {
  if (v == null || v === 0) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export function PortfolioValueCard({
  totalValue,
  numPositions,
  hasPortfolio,
}: Props) {
  const formatted = formatValue(totalValue);

  return (
    <div className="card-elevated flex flex-col gap-1">
      <div className="text-label text-primary">PORTFOLIO VALUE</div>

      {hasPortfolio && formatted ? (
        <>
          <div className="text-metric mt-2 leading-none">{formatted}</div>
          <p className="mt-1 text-body-sm text-slate-600">
            {numPositions != null && numPositions > 0
              ? `${numPositions} portfolio${numPositions > 1 ? "s" : ""} analysed`
              : "Portfolio analysed"}
          </p>
        </>
      ) : (
        <>
          <div className="mt-2 text-[32px] font-semibold text-slate-300">—</div>
          <p className="mt-1 text-body-sm text-slate-600">
            {hasPortfolio ? "Value loading" : "No portfolio yet"}
          </p>
        </>
      )}
    </div>
  );
}
