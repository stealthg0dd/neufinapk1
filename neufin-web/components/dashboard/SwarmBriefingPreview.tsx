"use client";

import Link from "next/link";
import type { SwarmReport } from "@/hooks/usePortfolioData";

interface Props {
  swarmReport: SwarmReport;
}

export function SwarmBriefingPreview({ swarmReport }: Props) {
  const headline = swarmReport.headline ?? "IC Briefing Available";
  const briefing =
    swarmReport.briefing ?? swarmReport.recommendation_summary ?? "";
  const regime = swarmReport.regime ?? "";
  const rawRisks = swarmReport.top_risks;
  const topRisks: string[] = Array.isArray(rawRisks)
    ? rawRisks.slice(0, 3)
    : typeof rawRisks === "string"
      ? rawRisks.split("\n").filter(Boolean).slice(0, 3)
      : [];
  const date = swarmReport.generated_at ?? swarmReport.created_at;

  return (
    <div
      style={{
        background: "#161D2E",
        borderRadius: 12,
        border: "1px solid #2A3550",
        padding: "20px 20px 16px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              color: "#1EB8CC",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.09em",
              marginBottom: 4,
            }}
          >
            SWARM IC BRIEFING
          </div>
          <div style={{ color: "#F0F4FF", fontSize: 14, fontWeight: 600 }}>
            {headline}
          </div>
          {regime && (
            <div style={{ color: "#F5A623", fontSize: 11, marginTop: 3 }}>
              Regime:{" "}
              {regime
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())}
            </div>
          )}
        </div>
        {date && (
          <div
            style={{
              color: "#64748B",
              fontSize: 10,
              whiteSpace: "nowrap",
              marginLeft: 12,
            }}
          >
            {new Date(date).toLocaleDateString("en-SG", {
              day: "numeric",
              month: "short",
            })}
          </div>
        )}
      </div>

      {briefing && (
        <div
          style={{
            color: "#94A3B8",
            fontSize: 12,
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          {briefing.slice(0, 280)}
          {briefing.length > 280 ? "…" : ""}
        </div>
      )}

      {topRisks.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              color: "#EF4444",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              marginBottom: 6,
            }}
          >
            TOP RISKS
          </div>
          {topRisks.map((risk, i) => (
            <div
              key={i}
              style={{
                color: "#F0F4FF",
                fontSize: 11,
                paddingLeft: 10,
                borderLeft: "2px solid #EF4444",
                marginBottom: 5,
              }}
            >
              {typeof risk === "string" ? risk.slice(0, 120) : String(risk)}
            </div>
          ))}
        </div>
      )}

      <Link
        href="/dashboard/swarm"
        style={{
          fontSize: 11,
          color: "#1EB8CC",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        View full IC briefing →
      </Link>
    </div>
  );
}
