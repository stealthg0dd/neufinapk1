"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "https://neufin-backend-production.up.railway.app";

type BiasFlag = {
  name: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description?: string;
};

type BriefData = {
  dna_score: number;
  investor_type: string;
  churn_risk_level: "HIGH" | "MEDIUM" | "LOW";
  churn_risk_score: number;
  churn_risk_narrative: string;
  structural_biases: BiasFlag[];
  coaching_message: string;
};

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "#EF4444",
  MEDIUM: "#F5A623",
  LOW: "#22C55E",
};

const CHURN_COLORS: Record<string, string> = {
  HIGH: "#EF4444",
  MEDIUM: "#F5A623",
  LOW: "#22C55E",
};

function DnaRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = size / 2 - 8;
  const circumference = 2 * Math.PI * r;
  const progress = (score / 100) * circumference;
  const color =
    score >= 70 ? "#22C55E" : score >= 40 ? "#F5A623" : "#EF4444";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#1E293B"
        strokeWidth={7}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeDasharray={`${progress} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={size * 0.2}
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
      >
        {score}
      </text>
      <text
        x={size / 2}
        y={size / 2 + size * 0.2}
        textAnchor="middle"
        fill="#64748B"
        fontSize={size * 0.1}
        fontFamily="system-ui, sans-serif"
      >
        / 100
      </text>
    </svg>
  );
}

export default function BehavioralBriefWidget() {
  const params = useSearchParams();
  const portfolioId = params.get("portfolio_id") ?? "";
  const apiKey = params.get("api_key") ?? "";
  const theme = params.get("theme") ?? "dark";

  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDark = theme !== "light";

  const bg = isDark ? "#0B0F14" : "#FFFFFF";
  const card = isDark ? "#161D2E" : "#F8FAFC";
  const border = isDark ? "#2A3550" : "#E2E8F0";
  const text = isDark ? "#F0F4FF" : "#0F172A";
  const muted = isDark ? "#64748B" : "#64748B";

  useEffect(() => {
    if (!portfolioId || !apiKey) {
      setError("portfolio_id and api_key are required.");
      setLoading(false);
      return;
    }

    async function fetchBrief() {
      try {
        const res = await fetch(
          `${API_BASE}/api/portfolio/${portfolioId}/metrics`,
          {
            headers: {
              "X-NeuFin-API-Key": apiKey,
            },
          },
        );
        if (!res.ok) {
          setError(`API error ${res.status}`);
          setLoading(false);
          return;
        }
        const json = await res.json();

        // Normalise the response into our compact BriefData shape
        const metrics = json.metrics || json;
        const biases: BiasFlag[] = (
          metrics.structural_biases ||
          metrics.behavioral_biases ||
          []
        ).slice(0, 3);

        const churnLevel: "HIGH" | "MEDIUM" | "LOW" =
          metrics.churn_risk_level ?? "MEDIUM";
        const churnScore = metrics.churn_risk_score ?? 50;

        const topBias = biases[0];
        const coaching =
          metrics.churn_risk_narrative ||
          (topBias
            ? `Your ${topBias.name?.toLowerCase() ?? "concentration"} is your biggest risk right now.`
            : "Review your concentration and behavioral biases.");

        setData({
          dna_score: metrics.dna_score ?? json.dna_score ?? 50,
          investor_type:
            metrics.investor_type ?? json.investor_type ?? "Balanced",
          churn_risk_level: churnLevel,
          churn_risk_score: churnScore,
          churn_risk_narrative: coaching,
          structural_biases: biases,
          coaching_message: coaching,
        });
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : "Failed to load portfolio data",
        );
      } finally {
        setLoading(false);
      }
    }

    void fetchBrief();
  }, [portfolioId, apiKey]);

  if (loading) {
    return (
      <div
        style={{
          background: bg,
          minHeight: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: "2px solid #1EB8CC",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          background: bg,
          padding: "16px",
          color: "#EF4444",
          fontFamily: "system-ui, sans-serif",
          fontSize: "12px",
        }}
      >
        {error ?? "No data available"}
      </div>
    );
  }

  const topBiases = data.structural_biases.slice(0, 3);
  const churnColor = CHURN_COLORS[data.churn_risk_level] ?? "#F5A623";
  const fullReportUrl = portfolioId
    ? `/dashboard/portfolio?id=${portfolioId}`
    : "/dashboard/portfolio";

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "12px",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: text,
        minWidth: "280px",
        maxWidth: "100%",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "14px",
        }}
      >
        <DnaRing score={data.dna_score} size={72} />
        <div style={{ flex: 1 }}>
          <p
            style={{ margin: 0, fontSize: "11px", color: muted, textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            Portfolio DNA
          </p>
          <p
            style={{
              margin: "2px 0 6px",
              fontSize: "14px",
              fontWeight: 600,
              color: text,
            }}
          >
            {data.investor_type}
          </p>
          {/* Churn risk badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                background: churnColor,
                color: "#fff",
                borderRadius: "4px",
                padding: "1px 7px",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.03em",
              }}
            >
              {data.churn_risk_level}
            </span>
            <span style={{ fontSize: "11px", color: muted }}>
              Correction Exit Risk
            </span>
          </div>
        </div>
      </div>

      {/* Top bias flags */}
      {topBiases.length > 0 && (
        <div
          style={{
            background: card,
            borderRadius: "8px",
            padding: "10px 12px",
            marginBottom: "12px",
          }}
        >
          <p
            style={{
              margin: "0 0 6px",
              fontSize: "10px",
              color: muted,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Top Bias Flags
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {topBiases.map((bias, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <span style={{ fontSize: "12px", color: text }}>
                  {bias.name}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color:
                      SEVERITY_COLORS[bias.severity] ??
                      SEVERITY_COLORS.MEDIUM,
                  }}
                >
                  {bias.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coaching message */}
      <p
        style={{
          margin: "0 0 12px",
          fontSize: "12px",
          color: muted,
          lineHeight: "1.5",
          fontStyle: "italic",
        }}
      >
        &ldquo;{data.coaching_message}&rdquo;
      </p>

      {/* CTA */}
      <a
        href={fullReportUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          fontSize: "12px",
          color: "#1EB8CC",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        See full analysis →
      </a>
    </div>
  );
}
