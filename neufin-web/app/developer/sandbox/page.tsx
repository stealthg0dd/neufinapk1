"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";

const API_BASE = "https://neufin-backend-production.up.railway.app";

const DEFAULT_PAYLOAD = JSON.stringify(
  {
    positions: [
      { ticker: "AAPL", shares: 100 },
      { ticker: "MSFT", shares: 50 },
      { ticker: "GOOGL", shares: 30 },
    ],
    market_code: "US",
    api_key: "demo_key_neufin_sandbox",
  },
  null,
  2,
);

const OPENAPI_SPECS = [
  {
    id: "analyze",
    method: "POST",
    path: "/api/dna/generate",
    summary: "Analyze portfolio behavioral DNA",
    description:
      "Upload a portfolio CSV and receive behavioral DNA score, bias flags, investor archetype, churn risk, and shareable result URL.",
    request: `multipart/form-data
  file: CSV with columns: symbol, shares, cost_basis (optional)
  quant_modes: "alpha,risk,institutional" (optional CSV string)`,
    response: `{
  "dna_score": 72,
  "investor_type": "Conviction Growth",
  "churn_risk_score": 45,
  "churn_risk_level": "MEDIUM",
  "churn_risk_narrative": "...",
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "recommendation": "...",
  "share_url": "https://neufin.ai/share/abc12345",
  "metrics": {
    "hhi": 0.28,
    "weighted_beta": 1.12,
    "total_value": 42500,
    "structural_biases": [...]
  }
}`,
  },
  {
    id: "report",
    method: "POST",
    path: "/api/reports/generate",
    summary: "Generate institutional PDF report",
    description:
      "Generates a full IC-ready PDF (11 pages) from a saved portfolio, including swarm IC synthesis, DNA, risk attribution, VaR, and behavioral bias section.",
    request: `{
  "portfolio_id": "uuid",
  "theme": "light | dark",
  "include_swarm": true
}`,
    response: `{
  "report_url": "https://...",
  "report_id": "uuid",
  "ic_readiness": "ADVISOR-READY",
  "ic_readiness_score": 75,
  "pages": 11
}`,
  },
  {
    id: "health",
    method: "GET",
    path: "/api/health",
    summary: "API health check",
    description:
      "Returns service health, version, uptime, and component status. No auth required.",
    request: "No body required.\nOptional: X-NeuFin-API-Key header.",
    response: `{
  "status": "ok",
  "version": "2.1.0",
  "components": {
    "database": "ok",
    "ai": "ok",
    "redis": "ok",
    "price_feed": "ok"
  }
}`,
  },
];

export default function SandboxPage() {
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [result, setResult] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSpec, setOpenSpec] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);
    setHttpStatus(null);
    setElapsed(null);

    let parsed: { positions?: { ticker: string; shares: number }[] };
    try {
      parsed = JSON.parse(payload);
    } catch {
      setError("Invalid JSON — fix the payload and try again.");
      setLoading(false);
      return;
    }

    const positions = parsed.positions ?? [];
    if (!positions.length) {
      setError('Payload must include a non-empty "positions" array.');
      setLoading(false);
      return;
    }

    // Convert JSON positions → CSV blob for the file-upload endpoint
    const csvRows = [
      "symbol,shares",
      ...positions.map((p) => `${p.ticker},${p.shares}`),
    ];
    const csvBlob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const form = new FormData();
    form.append("file", csvBlob, "portfolio.csv");
    form.append("quant_modes", "alpha,risk,institutional");

    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE}/api/dna/generate`, {
        method: "POST",
        body: form,
      });
      const ms = Math.round(performance.now() - t0);
      setElapsed(ms);
      setHttpStatus(res.status);
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
    } catch (e: unknown) {
      setError(
        `Request failed: ${e instanceof Error ? e.message : "network error"}`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-app text-navy">
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-navy"
            >
              NeuFin
            </Link>
            <span className="text-muted2">/</span>
            <Link
              href="/developer"
              className="text-muted2 transition-colors hover:text-navy"
            >
              Developer
            </Link>
            <span className="text-muted2">/</span>
            <span className="font-medium text-navy">Sandbox</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/developer/docs"
              className="text-sm text-muted2 transition-colors hover:text-navy"
            >
              Docs
            </Link>
            <Link
              href="/developer/keys"
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Get API Key →
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl space-y-12 px-6 py-12">
        {/* Header */}
        <div className="space-y-4">
          <span className="inline-block rounded-full border border-primary/25 bg-primary-light px-4 py-1 text-sm font-medium text-primary-dark">
            Live Sandbox
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">
            API Sandbox
          </h1>
          <p className="max-w-2xl text-lg text-slate2">
            Send a real request to the NeuFin API and see the full behavioral
            DNA response — including churn risk score, bias flags, and investor
            archetype. No account required with the demo key.
          </p>
        </div>

        {/* Editor + Output */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Editor panel */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-navy">Request Payload</h2>
              <div className="flex items-center gap-2">
                <code className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted2">
                  POST /api/dna/generate
                </code>
                <button
                  onClick={() => setPayload(DEFAULT_PAYLOAD)}
                  title="Reset to default"
                  className="rounded p-1 text-muted2 transition-colors hover:text-navy"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-border-light bg-surface-2 px-4 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-2 font-mono text-xs text-muted2">
                  portfolio.json
                </span>
              </div>
              <textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                className="w-full resize-none bg-white p-4 font-mono text-sm text-navy outline-none"
                rows={18}
                spellCheck={false}
                aria-label="Request payload"
              />
            </div>
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-4 w-4" />
              {loading ? "Analyzing portfolio…" : "Run Analysis"}
            </button>
          </div>

          {/* Output panel */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-navy">Response</h2>
              <div className="flex items-center gap-2">
                {httpStatus !== null && (
                  <span
                    className={[
                      "rounded px-2 py-0.5 font-mono text-xs font-semibold",
                      httpStatus >= 200 && httpStatus < 300
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700",
                    ].join(" ")}
                  >
                    {httpStatus}
                  </span>
                )}
                {elapsed !== null && (
                  <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted2">
                    {elapsed} ms
                  </span>
                )}
              </div>
            </div>
            <div className="h-[468px] overflow-auto rounded-xl border border-border bg-[#0B0F14] shadow-sm">
              {error ? (
                <p className="p-4 font-mono text-sm text-red-400">{error}</p>
              ) : result ? (
                <pre className="p-4 font-mono text-xs leading-relaxed text-[#CBD5E1]">
                  {result}
                </pre>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[#64748B]">
                  {loading ? (
                    <>
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1EB8CC] border-t-transparent" />
                      <span>Running behavioral DNA analysis…</span>
                    </>
                  ) : (
                    <span>Hit Run Analysis to see the full API response</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Churn risk callout */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4">
          <p className="text-sm text-amber-800">
            <strong>New:</strong> The response now includes{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              churn_risk_score
            </code>{" "}
            (0–100) and{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              churn_risk_level
            </code>{" "}
            — the probability this investor exits during a 10%+ market
            correction. Powered by concentration, bias, and regime analysis.
          </p>
        </div>

        {/* Try your own portfolio */}
        <section className="space-y-4 rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-navy">
            Try Your Own Portfolio
          </h2>
          <p className="text-slate2">
            Edit the JSON payload above to analyze any portfolio. Follow this
            format:
          </p>
          <pre className="overflow-x-auto rounded-xl border border-border-light bg-surface-2 p-4 font-mono text-sm text-slate2">
            {`{
  "positions": [
    { "ticker": "YOUR_SYMBOL", "shares": 100 },
    { "ticker": "ANOTHER",     "shares": 50  }
  ],
  "market_code": "US"   // "US" | "VN" | "SG" | "GB" | "TH" | "MY"
}`}
          </pre>
          <ul className="space-y-1.5 text-sm text-slate2">
            <li>
              •{" "}
              <strong className="text-navy">ticker</strong> — any
              exchange-listed symbol (AAPL, VCI.VN, STI.SI, HSBA.L…)
            </li>
            <li>
              •{" "}
              <strong className="text-navy">shares</strong> — number of shares
              held (integer or decimal)
            </li>
            <li>
              •{" "}
              <strong className="text-navy">market_code</strong> — sets the
              benchmark and behavioral context
            </li>
            <li>
              • The{" "}
              <code className="rounded bg-surface-2 px-1 font-mono text-xs text-primary-dark">
                demo_key_neufin_sandbox
              </code>{" "}
              key grants 10 sandbox requests/hour with full DNA output
            </li>
          </ul>
        </section>

        {/* OpenAPI Spec sections */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-navy">API Reference</h2>
          <div className="space-y-3">
            {OPENAPI_SPECS.map((spec) => (
              <div
                key={spec.id}
                className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
              >
                <button
                  onClick={() =>
                    setOpenSpec(openSpec === spec.id ? null : spec.id)
                  }
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={[
                        "rounded px-2 py-0.5 font-mono text-xs font-bold",
                        spec.method === "GET"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700",
                      ].join(" ")}
                    >
                      {spec.method}
                    </span>
                    <code className="font-mono text-sm text-navy">
                      {spec.path}
                    </code>
                    <span className="text-sm text-muted2">{spec.summary}</span>
                  </div>
                  {openSpec === spec.id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted2" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted2" />
                  )}
                </button>
                {openSpec === spec.id && (
                  <div className="space-y-4 border-t border-border-light px-5 pb-5 pt-4">
                    <p className="text-sm text-slate2">{spec.description}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted2">
                          Request
                        </p>
                        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-slate2">
                          {spec.request}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted2">
                          Response
                        </p>
                        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-slate2">
                          {spec.response}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary-light/40 p-8 text-center">
          <h2 className="text-2xl font-bold text-navy">
            Ready to integrate?
          </h2>
          <p className="text-slate2">
            Generate a production API key and start processing client portfolios
            at scale. Enterprise plans include batch processing and white-label
            PDF reports.
          </p>
          <Link
            href="/developer/keys"
            className="inline-block rounded-xl bg-primary px-8 py-3 font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Get your API key →
          </Link>
        </section>
      </div>
    </div>
  );
}
