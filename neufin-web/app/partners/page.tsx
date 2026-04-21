"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { PopularPlanBadge } from "@/components/ui/PopularPlanBadge";

// ─── types ────────────────────────────────────────────────────────────────────
type DemoStatus = "idle" | "analyzing" | "done" | "error";
type DemoResult = {
  dna_score?: number;
  investor_type?: string;
  weaknesses?: string[];
  strengths?: string[];
  recommendation?: string;
  error?: string;
};
type CodeTab = "python" | "javascript" | "curl";

// ─── constants ────────────────────────────────────────────────────────────────
const DEFAULT_TICKERS = "AAPL, MSFT, JPM, GLD, TLT, PFE";
const RAILWAY_BASE = "https://neufin101-production.up.railway.app";

// Fake agent names that light up in sequence while waiting
const AGENT_NAMES = [
  "Market Regime Analyst",
  "Macro Strategist",
  "Quant Engine",
  "Tax Architect",
  "Risk Sentinel",
  "Alpha Scout",
  "IC Synthesizer",
];

// ─── helpers ──────────────────────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 70) return "#22C55E";
  if (score >= 45) return "#F5A623";
  return "#EF4444";
}

function scoreLabel(score: number) {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Fair";
  return "Needs Work";
}

// CSV lines that the demo endpoint receives (one row per ticker)
function buildDemoCsv(tickers: string[]): string {
  const header = "symbol,shares,price,value,weight";
  const rows = tickers.map((sym, i) => {
    const price = 100;
    const shares = 10;
    const value = price * shares;
    const weight = ((1 / tickers.length) * 100).toFixed(2);
    return `${sym.trim().toUpperCase()},${shares},${price},${value},${weight}`;
  });
  return [header, ...rows].join("\n");
}

// ─── sub-components ──────────────────────────────────────────────────────────

function AgentTraceDots({
  active,
  completedCount,
}: {
  active: boolean;
  completedCount: number;
}) {
  return (
    <div className="flex flex-col gap-2 py-2">
      {AGENT_NAMES.map((name, i) => {
        const done = i < completedCount;
        const running = active && i === completedCount;
        return (
          <div key={name} className="flex items-center gap-3 text-sm">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background: done ? "#22C55E" : running ? "#F5A623" : "#2A3550",
                boxShadow: running ? "0 0 6px #F5A62388" : "none",
                transition: "background 0.3s",
              }}
            />
            <span
              style={{
                color: done ? "#0F172A" : running ? "#F5A623" : "#475569",
                fontSize: 12,
              }}
            >
              {name}
              {done && (
                <span style={{ color: "#22C55E", marginLeft: 6, fontSize: 11 }}>
                  ✓
                </span>
              )}
              {running && (
                <span
                  style={{
                    color: "#F5A623",
                    marginLeft: 6,
                    fontSize: 11,
                    animation: "pulse 1s infinite",
                  }}
                >
                  ●
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DnaResultCard({ result }: { result: DemoResult }) {
  const score = result.dna_score ?? 0;
  const color = scoreColor(score);
  const label = scoreLabel(score);
  const topBias = result.weaknesses?.[0] ?? "No significant biases detected";
  const rec =
    result.recommendation ??
    result.strengths?.[0] ??
    "Portfolio construction is sound.";

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        padding: "24px 28px",
        marginTop: 20,
      }}
    >
      {/* Score */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            border: `4px solid ${color}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
            {score}
          </span>
          <span style={{ fontSize: 10, color: "#64748B" }}>/100</span>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
            {label} Portfolio Health
          </div>
          <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
            {result.investor_type ?? "Balanced Investor"}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: "#F8FAFC",
            borderRadius: 8,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            Top Bias Detected
          </div>
          <div style={{ fontSize: 12, color: "#FBBF24", lineHeight: 1.4 }}>
            {topBias.slice(0, 90)}
            {topBias.length > 90 ? "…" : ""}
          </div>
        </div>
        <div
          style={{
            background: "#F8FAFC",
            borderRadius: 8,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            Top Recommendation
          </div>
          <div style={{ fontSize: 12, color: "#34D399", lineHeight: 1.4 }}>
            {rec.slice(0, 90)}
            {rec.length > 90 ? "…" : ""}
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #1E3A5F",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 12,
          color: "#64748B",
          lineHeight: 1.5,
        }}
      >
        This is approximately{" "}
        <strong style={{ color: "#64748B" }}>
          10% of the full IC analysis
        </strong>
        . The complete output includes 7-agent swarm briefing, regime
        positioning, tax harvesting, alpha signals, and a 10-page white-labeled
        IC memo.
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link
          href="/auth"
          style={{
            background: "#0EA5E9",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Get Full API Access →
        </Link>
        <a
          href="https://neufin101-production.up.railway.app/static/sample-report.pdf"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: "transparent",
            color: "#64748B",
            padding: "10px 20px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            border: "1px solid #2A3550",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          See Sample PDF
        </a>
      </div>
    </div>
  );
}

// ─── code snippets ─────────────────────────────────────────────────────────────
const CODE: Record<CodeTab, string> = {
  python: `import requests

response = requests.post(
    "${RAILWAY_BASE}/api/partners/analyze",
    headers={"X-API-Key": "your_api_key"},
    json={
        "portfolio": {
            "positions": [
                {"symbol": "AAPL", "shares": 25, "cost_basis": 150},
                {"symbol": "NVDA", "shares": 10, "cost_basis": 400},
            ],
            "total_value": 10000
        },
        "user_id": "client_123",
        "context": "quarterly_review"
    }
)

result = response.json()
print(f"DNA Score:  {result['dna_score']}")
print(f"Verdict:    {result['verdict']}")
print(f"Top Action: {result['recommendations'][0]['action']}")`,

  javascript: `const response = await fetch(
  "${RAILWAY_BASE}/api/partners/analyze",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "your_api_key",
    },
    body: JSON.stringify({
      portfolio: {
        positions: [
          { symbol: "AAPL", shares: 25, cost_basis: 150 },
          { symbol: "NVDA", shares: 10, cost_basis: 400 },
        ],
        total_value: 10000,
      },
      user_id: "client_123",
      context: "quarterly_review",
    }),
  }
)

const result = await response.json()
console.log("DNA Score: ",  result.dna_score)
console.log("Verdict:   ",  result.verdict)
console.log("Top Action:",  result.recommendations[0].action)`,

  curl: `curl -X POST "${RAILWAY_BASE}/api/partners/analyze" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your_api_key" \\
  -d '{
    "portfolio": {
      "positions": [
        {"symbol": "AAPL", "shares": 25, "cost_basis": 150},
        {"symbol": "NVDA", "shares": 10, "cost_basis": 400}
      ],
      "total_value": 10000
    },
    "user_id": "client_123",
    "context": "quarterly_review"
  }'`,
};

// ─── page ─────────────────────────────────────────────────────────────────────
export default function PartnersPage() {
  // Sandbox state
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [demoStatus, setDemoStatus] = useState<DemoStatus>("idle");
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [completedAgents, setCompletedAgents] = useState(0);
  const [copied, setCopied] = useState(false);

  // ROI calculator
  const [clients, setClients] = useState(50);
  const [avgAum, setAvgAum] = useState(300);
  const [hoursPerClient, setHoursPerClient] = useState(4);

  // Code tab
  const [codeTab, setCodeTab] = useState<CodeTab>("python");
  const [codeCopied, setCodeCopied] = useState(false);

  // ROI calculations
  const savedHours = Math.round(clients * hoursPerClient * 0.9);
  const additionalClients =
    hoursPerClient > 0 ? Math.floor(savedHours / hoursPerClient) : 0;
  const additionalRevenue = additionalClients * avgAum * 1000 * 0.01;

  // Animate agents while analyzing
  const agentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (demoStatus === "analyzing") {
      setCompletedAgents(0);
      agentTimerRef.current = setInterval(() => {
        setCompletedAgents((prev) => {
          if (prev >= AGENT_NAMES.length - 1) {
            if (agentTimerRef.current) clearInterval(agentTimerRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, 1400);
    } else {
      if (agentTimerRef.current) clearInterval(agentTimerRef.current);
    }
    return () => {
      if (agentTimerRef.current) clearInterval(agentTimerRef.current);
    };
  }, [demoStatus]);

  const runDemo = useCallback(async () => {
    const tickerList = tickers
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tickerList.length) return;

    setDemoStatus("analyzing");
    setDemoResult(null);

    try {
      const csv = buildDemoCsv(tickerList);
      const formData = new FormData();
      const blob = new Blob([csv], { type: "text/csv" });
      formData.append("file", blob, "demo-portfolio.csv");

      const res = await fetch("/api/partners/demo", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as DemoResult;

      if (!res.ok) {
        setDemoResult({ error: data.error ?? `Server error ${res.status}` });
        setDemoStatus("error");
        return;
      }

      setDemoResult(data);
      setCompletedAgents(AGENT_NAMES.length);
      setDemoStatus("done");
    } catch (err) {
      setDemoResult({ error: "Network error — please try again." });
      setDemoStatus("error");
    }
  }, [tickers]);

  const curlSnippet = `curl -X POST "${RAILWAY_BASE}/api/analyze-dna" \\
  -F "file=@portfolio.csv"`;

  const copyCurl = () => {
    navigator.clipboard.writeText(curlSnippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(CODE[codeTab]).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  // ─── render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ background: "#F6F8FB", color: "#0F172A", minHeight: "100vh" }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav
        style={{
          borderBottom: "1px solid #E2E8F0",
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 24px",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <BrandLogo variant="marketing-nav" href="/" />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              fontSize: 14,
            }}
          >
            <a
              href="#sandbox"
              style={{ color: "var(--readable-muted)", textDecoration: "none" }}
            >
              Live Demo
            </a>
            <a
              href="#pricing"
              style={{ color: "var(--readable-muted)", textDecoration: "none" }}
            >
              Pricing
            </a>
            <a
              href="#integration"
              style={{ color: "var(--readable-muted)", textDecoration: "none" }}
            >
              Docs
            </a>
            <Link
              href="/auth"
              style={{
                background: "#1EB8CC",
                color: "#fff",
                padding: "7px 18px",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Get Access
            </Link>
          </div>
        </div>
      </nav>

      {/* ── SECTION 1: Hero ──────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "80px 24px 60px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "rgba(14,165,233,0.1)",
            border: "1px solid rgba(14,165,233,0.3)",
            borderRadius: 20,
            padding: "4px 16px",
            fontSize: 12,
            color: "#1EB8CC",
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          Partner API Platform
        </div>

        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: 24,
            letterSpacing: -1,
          }}
        >
          Your platform.
          <br />
          <span style={{ color: "#0EA5E9" }}>
            Institutional-grade portfolio intelligence.
          </span>
          <br />
          One API call.
        </h1>

        <p
          style={{
            fontSize: 18,
            color: "#64748B",
            maxWidth: 620,
            margin: "0 auto 40px",
            lineHeight: 1.7,
          }}
        >
          NeuFin&apos;s 7-agent swarm delivers Investment Committee-grade analysis
          for every client portfolio. Fully white-labeled. Embeds in 12 lines of
          code.
        </p>

        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href="#sandbox"
            style={{
              background: "#0EA5E9",
              color: "#fff",
              padding: "14px 32px",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Try Live Sandbox
          </a>
          <a
            href="#pricing"
            style={{
              background: "transparent",
              color: "#64748B",
              padding: "14px 32px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 15,
              border: "1px solid #2A3550",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            View Pricing
          </a>
        </div>

        {/* Social proof bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 40,
            marginTop: 56,
            paddingTop: 40,
            borderTop: "1px solid #E2E8F0",
            flexWrap: "wrap",
          }}
        >
          {[
            { value: "15s", label: "DNA analysis latency" },
            { value: "7", label: "AI agents per analysis" },
            { value: "10-page", label: "IC memo output" },
            { value: "Enterprise", label: "grade reliability" },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#0EA5E9" }}>
                {value}
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 2: Live Sandbox ───────────────────────────────────────────── */}
      <section
        id="sandbox"
        style={{
          background: "#F8FAFC",
          borderTop: "1px solid #E2E8F0",
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div
              style={{
                display: "inline-block",
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 20,
                padding: "4px 16px",
                fontSize: 12,
                color: "#22C55E",
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Live Sandbox — No Account Required
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}>
              See it work in 15 seconds
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "#64748B",
                maxWidth: 540,
                margin: "0 auto",
              }}
            >
              Enter any US stock tickers below. We&apos;ll run a real behavioral DNA
              analysis against live market data — same engine used in
              production.
            </p>
          </div>

          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 12,
              padding: 28,
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "#64748B",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              Portfolio tickers (comma-separated)
            </label>
            <textarea
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              rows={2}
              disabled={demoStatus === "analyzing"}
              style={{
                width: "100%",
                background: "#F8FAFC",
                border: "1px solid #2A3550",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#0F172A",
                fontSize: 14,
                fontFamily: "monospace",
                resize: "vertical",
                boxSizing: "border-box",
                outline: "none",
                opacity: demoStatus === "analyzing" ? 0.5 : 1,
              }}
            />
            <button
              onClick={runDemo}
              disabled={demoStatus === "analyzing"}
              style={{
                marginTop: 16,
                background: demoStatus === "analyzing" ? "#1E3A5F" : "#0EA5E9",
                color: demoStatus === "analyzing" ? "#1EB8CC" : "#fff",
                padding: "12px 28px",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                border: "none",
                cursor: demoStatus === "analyzing" ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {demoStatus === "analyzing" ? (
                <>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      border: "2px solid #1EB8CC",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      display: "inline-block",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  Analyzing portfolio...
                </>
              ) : (
                "Analyze Portfolio"
              )}
            </button>

            {/* Agent trace */}
            {(demoStatus === "analyzing" || demoStatus === "done") && (
              <div
                style={{
                  marginTop: 24,
                  borderTop: "1px solid #E2E8F0",
                  paddingTop: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}
                >
                  Agent Trace
                </div>
                <AgentTraceDots
                  active={demoStatus === "analyzing"}
                  completedCount={
                    demoStatus === "done" ? AGENT_NAMES.length : completedAgents
                  }
                />
              </div>
            )}

            {/* Result card */}
            {demoStatus === "done" && demoResult && !demoResult.error && (
              <DnaResultCard result={demoResult} />
            )}

            {/* Error state */}
            {(demoStatus === "error" ||
              (demoStatus === "done" && demoResult?.error)) && (
              <div
                style={{
                  marginTop: 20,
                  background: "#1C0A0A",
                  border: "1px solid #7F1D1D",
                  borderRadius: 8,
                  padding: "12px 16px",
                  color: "#FCA5A5",
                  fontSize: 13,
                }}
              >
                {demoResult?.error ?? "Analysis failed. Please try again."}
              </div>
            )}
          </div>

          {/* cURL copy section */}
          <div style={{ marginTop: 24 }}>
            <div
              style={{
                fontSize: 12,
                color: "#64748B",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              API call equivalent
            </div>
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
                padding: "14px 18px",
                fontFamily: "monospace",
                fontSize: 12,
                color: "#64748B",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", flex: 1 }}>
                {curlSnippet}
              </pre>
              <button
                onClick={copyCurl}
                style={{
                  background: copied ? "rgba(34,197,94,0.15)" : "#E2E8F0",
                  color: copied ? "#22C55E" : "#64748B",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {copied ? "✓ Copied" : "Copy as cURL"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: What Partners Get ─────────────────────────────────────── */}
      <section
        style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px" }}
      >
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>
            What Partners Get
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "#64748B",
              maxWidth: 500,
              margin: "0 auto",
            }}
          >
            Everything you need to add institutional-grade intelligence to your
            platform.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {[
            {
              icon: null,
              title: "Behavioral DNA Engine",
              desc: "47 behavioral bias detectors, HHI, beta, and correlation clustering. Investor archetype and risk profile in 15 seconds.",
              tags: [
                "Disposition Effect",
                "Recency Bias",
                "Home Bias",
                "Loss Aversion",
              ],
              color: "#8B5CF6",
            },
            {
              icon: null,
              title: "IC-Grade Memos",
              desc: "Full 7-agent swarm analysis. Client-ready Investment Committee briefing. White-labeled 10-page PDF delivered in 90 seconds.",
              tags: [
                "10-page PDF",
                "White-label",
                "Regime Analysis",
                "Alpha Signals",
              ],
              color: "#0EA5E9",
            },
            {
              icon: null,
              title: "Real-Time Alerts",
              desc: "Regime-change notifications, portfolio-drift alerts, and webhook delivery directly into your platform.",
              tags: [
                "Webhooks",
                "Regime Shifts",
                "Drift Alerts",
                "Daily Digest",
              ],
              color: "#22C55E",
            },
          ].map((col) => (
            <div
              key={col.title}
              style={{
                background: "#FFFFFF",
                border: `1px solid ${col.color}22`,
                borderRadius: 16,
                padding: 32,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: col.color,
                  borderRadius: "16px 16px 0 0",
                }}
              />
              <div style={{ fontSize: 40, marginBottom: 16 }}>
                {col.icon ?? null}
              </div>
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  marginBottom: 12,
                  color: "#0F172A",
                }}
              >
                {col.title}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: "#64748B",
                  lineHeight: 1.7,
                  marginBottom: 20,
                }}
              >
                {col.desc}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {col.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      background: `${col.color}15`,
                      border: `1px solid ${col.color}30`,
                      color: col.color,
                      borderRadius: 6,
                      padding: "3px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 4: ROI Calculator ──────────────────────────────────────────── */}
      <section
        style={{
          background: "#F8FAFC",
          borderTop: "1px solid #E2E8F0",
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>
              ROI Calculator
            </h2>
            <p style={{ fontSize: 16, color: "#64748B" }}>
              See how much time and revenue NeuFin unlocks for your practice.
            </p>
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}
          >
            {/* Inputs */}
            <div>
              <h3
                style={{
                  fontWeight: 700,
                  marginBottom: 20,
                  color: "#64748B",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  fontSize: 12,
                }}
              >
                Your Practice
              </h3>
              {[
                {
                  label: "Active clients",
                  value: clients,
                  setter: setClients,
                  min: 1,
                  max: 5000,
                },
                {
                  label: "Average AUM per client ($K)",
                  value: avgAum,
                  setter: setAvgAum,
                  min: 10,
                  max: 50000,
                },
                {
                  label: "Hours on reporting per client / quarter",
                  value: hoursPerClient,
                  setter: setHoursPerClient,
                  min: 0.5,
                  max: 40,
                },
              ].map(({ label, value, setter, min, max }) => (
                <div key={label} style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      fontSize: 13,
                      color: "#64748B",
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    {label}
                  </label>
                  <input
                    type="number"
                    value={value}
                    min={min}
                    max={max}
                    onChange={(e) => setter(Number(e.target.value) || 0)}
                    style={{
                      width: "100%",
                      background: "#FFFFFF",
                      border: "1px solid #2A3550",
                      borderRadius: 8,
                      padding: "10px 14px",
                      color: "#0F172A",
                      fontSize: 18,
                      fontWeight: 700,
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Outputs */}
            <div>
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 20,
                  color: "#64748B",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Your Annual Impact
              </h3>
              {[
                {
                  label: "Hours saved per quarter",
                  value: savedHours.toLocaleString(),
                  color: "#0EA5E9",
                  note: "90% automation of reporting time",
                },
                {
                  label: "Additional clients you can serve",
                  value: additionalClients.toLocaleString(),
                  color: "#8B5CF6",
                  note: "Using recovered hours",
                },
                {
                  label: "Additional annual revenue",
                  value: `$${Math.round(additionalRevenue).toLocaleString()}`,
                  color: "#22C55E",
                  note: "Calculated at 1% AUM fee on additional capacity unlocked by NeuFin automation.",
                },
              ].map(({ label, value, color, note }) => (
                <div
                  key={label}
                  style={{
                    background: "#FFFFFF",
                    border: `1px solid ${color}22`,
                    borderRadius: 12,
                    padding: "20px 24px",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 800,
                      color,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "#334155",
                      marginTop: 6,
                      fontWeight: 600,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                    {note}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: Pricing ────────────────────────────────────────────────── */}
      <section
        id="pricing"
        style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px" }}
      >
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>
            Partner Pricing
          </h2>
          <p style={{ fontSize: 16, color: "#64748B" }}>
            From solo IFAs to enterprise robo-advisors. Cancel anytime.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          {[
            {
              name: "STARTER",
              price: "Free",
              period: "90 days",
              color: "#475569",
              highlight: false,
              features: [
                "100 analyses per month",
                "Basic DNA and regime analysis",
                "Sandbox API access",
                "Community support",
              ],
              cta: "Start Free",
              ctaHref: "/auth",
            },
            {
              name: "GROWTH",
              price: "$499",
              period: "/month",
              color: "#0369A1",
              highlight: true,
              badge: "Most Popular",
              features: [
                "Unlimited DNA analysis",
                "Full 7-agent swarm IC reports",
                "White-label PDF generation",
                "Webhook alerts",
                "Email support",
              ],
              cta: "Start Growth Trial",
              ctaHref: "/auth",
            },
            {
              name: "INSTITUTIONAL",
              price: "$2,999",
              period: "/month",
              color: "#5B21B6",
              highlight: false,
              features: [
                "Everything in Growth",
                "Dedicated API endpoints",
                "Multi-client advisor dashboard",
                "Custom report templates",
                "Enterprise-grade reliability",
                "Full compliance documentation",
              ],
              cta: "Contact Sales",
              ctaHref: "mailto:partnerships@neufin.ai",
            },
          ].map((tier) => (
            <div
              key={tier.name}
              style={{
                background: "#FFFFFF",
                color: "#0F172A",
                border: `1px solid ${tier.highlight ? "#0369A1" : "#CBD5E1"}`,
                borderRadius: 8,
                padding: "32px 28px",
                position: "relative",
                boxShadow: tier.highlight ? "0 18px 44px rgba(3, 105, 161, 0.18)" : "none",
              }}
            >
              {tier.badge && (
                <PopularPlanBadge variant="pill">{tier.badge}</PopularPlanBadge>
              )}
              <div
                style={{
                  fontSize: 11,
                  color: tier.color,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}
              >
                {tier.name}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 4,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{ fontSize: 40, fontWeight: 800, color: "#0F172A" }}
                >
                  {tier.price}
                </span>
                <span style={{ fontSize: 14, color: "#475569" }}>
                  {tier.period}
                </span>
              </div>
              <div
                style={{
                  borderTop: "1px solid #CBD5E1",
                  margin: "20px 0 20px",
                }}
              />
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 28px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {tier.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      fontSize: 14,
                      color: "#334155",
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{ color: tier.color, flexShrink: 0, marginTop: 1 }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={tier.ctaHref}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                  background: tier.highlight ? "#0369A1" : "#FFFFFF",
                  color: tier.highlight ? "#fff" : tier.color,
                  border: tier.highlight ? "1px solid #0369A1" : `1px solid ${tier.color}`,
                }}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 6: Integration Code ───────────────────────────────────────── */}
      <section
        id="integration"
        style={{ background: "#F8FAFC", borderTop: "1px solid #E2E8F0" }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 12 }}>
              Integrate in Minutes
            </h2>
            <p style={{ fontSize: 16, color: "#64748B" }}>
              One endpoint. JSON in, IC-grade intelligence out.
            </p>
          </div>

          {/* Tab bar */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                borderBottom: "1px solid #E2E8F0",
                display: "flex",
                position: "relative",
              }}
            >
              {/* Traffic light dots */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  padding: "12px 16px",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#FF5F57",
                  }}
                />
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#FEBC2E",
                  }}
                />
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#28C840",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: "8px 8px",
                  marginLeft: "auto",
                }}
              >
                {(["python", "javascript", "curl"] as CodeTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCodeTab(tab)}
                    style={{
                      padding: "4px 14px",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      background: codeTab === tab ? "#E0F7FA" : "transparent",
                      color: codeTab === tab ? "#0F172A" : "#64748B",
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: codeTab === tab ? "none" : "none",
                    }}
                  >
                    {tab === "javascript"
                      ? "JavaScript"
                      : tab === "python"
                        ? "Python"
                        : "cURL"}
                  </button>
                ))}
                <button
                  onClick={copyCode}
                  style={{
                    padding: "4px 14px",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: codeCopied ? "rgba(34,197,94,0.15)" : "#1E3A5F",
                    color: codeCopied ? "#22C55E" : "#CBD5E1",
                    fontSize: 11,
                    fontWeight: 600,
                    marginLeft: 8,
                  }}
                >
                  {codeCopied ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
            <pre
              style={{
                margin: 0,
                padding: "24px 28px",
                fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                fontSize: 13,
                lineHeight: 1.8,
                color: "#64748B",
                overflowX: "auto",
                whiteSpace: "pre",
              }}
            >
              {CODE[codeTab]}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Footer CTA ────────────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>
          Ready to add Investment Committee-grade intelligence to your platform?
        </h2>
        <p style={{ fontSize: 16, color: "#64748B", marginBottom: 32 }}>
          Start with a 90-day free trial. No credit card required.
        </p>
        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/auth"
            style={{
              background: "#0EA5E9",
              color: "#fff",
              padding: "14px 36px",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            Start Free Trial
          </Link>
          <a
            href="mailto:partnerships@neufin.ai"
            style={{
              background: "transparent",
              color: "#64748B",
              padding: "14px 36px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 15,
              border: "1px solid #2A3550",
              textDecoration: "none",
            }}
          >
            Talk to Sales
          </a>
        </div>
      </section>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
    </div>
  );
}
