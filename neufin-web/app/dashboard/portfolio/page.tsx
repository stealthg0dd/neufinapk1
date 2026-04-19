"use client";

import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  Brain,
  Check,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { apiFetch, apiGet, apiPost } from "@/lib/api-client";
import type { DNAAnalysisResponse, Position } from "@/lib/api";
import { KPICard } from "@/components/ui/KPICard";
import { stripeSuccessUrlReports } from "@/lib/stripe-checkout-urls";
import { supabase } from "@/lib/supabase";
import PortfolioPie from "@/components/PortfolioPie";
import ChartLab from "@/components/dashboard/ChartLab";
import FinancialModelSelector from "@/components/dashboard/FinancialModelSelector";
import {
  getStoredReportTheme,
  type ReportTheme,
} from "@/components/dashboard/ReportThemeModal";
import {
  formatNativePrice,
  formatNativeValue,
  formatPortfolioTotalLine,
} from "@/lib/finance-content";

const STAGES = [
  {
    label: "Reading your holdings...",
    pct: 25,
    sub: "Parsing CSV rows and mapping tickers",
  },
  {
    label: "Calculating risk metrics...",
    pct: 50,
    sub: "Beta, concentration, correlation",
  },
  {
    label: "Running AI analysis...",
    pct: 80,
    sub: "Multi-model behavioral analysis",
  },
  {
    label: "Generating insights...",
    pct: 100,
    sub: "Narrative strengths and recommendations",
  },
];

/** Circumference for r=58 (140×140 SVG, stroke 12) */
const RING_C = 2 * Math.PI * 58;

// ── 3-step analysis state machine ────────────────────────────────────────────
type AnalysisStep = "idle" | "dna_complete" | "swarm_complete" | "report_ready";

const ANALYSIS_STEPS = [
  { id: "dna", label: "Portfolio DNA", desc: "~15 seconds" },
  { id: "swarm", label: "IC Analysis", desc: "~90 seconds" },
  { id: "report", label: "IC Report", desc: "~30 seconds" },
];

function StepIndicator({ step }: { step: AnalysisStep }) {
  const doneIds = {
    idle: [] as string[],
    dna_complete: ["dna"],
    swarm_complete: ["dna", "swarm"],
    report_ready: ["dna", "swarm", "report"],
  }[step];

  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        marginBottom: 20,
        background: "var(--surface)",
        borderRadius: 8,
        border: "1px solid var(--border)",
        padding: "14px 16px",
      }}
    >
      {ANALYSIS_STEPS.map((s, i) => {
        const done = doneIds.includes(s.id);
        const active = !done && i === doneIds.length;
        return (
          <div
            key={s.id}
            style={{ flex: 1, textAlign: "center", position: "relative" }}
          >
            {/* connector line */}
            {i > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  right: "50%",
                  width: "100%",
                  height: 2,
                  background: doneIds.includes(ANALYSIS_STEPS[i - 1].id)
                    ? "var(--primary)"
                    : "var(--border)",
                  zIndex: 0,
                }}
              />
            )}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: done
                  ? "var(--primary)"
                  : active
                    ? "color-mix(in srgb, var(--primary) 20%, transparent)"
                    : "var(--surface-2)",
                border: `2px solid ${done ? "var(--primary)" : active ? "var(--primary)" : "var(--border)"}`,
                color: done
                  ? "#0B0F14"
                  : active
                    ? "var(--primary)"
                    : "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 6px",
                fontSize: 14,
                fontWeight: 700,
                position: "relative",
                zIndex: 1,
              }}
            >
              {done ? "✓" : i + 1}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color:
                  done || active
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {s.desc}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PortfolioPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<DNAAnalysisResponse | null>(null);
  const [displayScore, setDisplayScore] = useState(0);
  const [plan, setPlan] = useState<
    "free" | "retail" | "advisor" | "enterprise"
  >("free");
  const [reportAt, setReportAt] = useState<string | null>(null);
  const [step, setStep] = useState<AnalysisStep>("idle");

  const [swarmResult, setSwarmResult] = useState<Record<
    string,
    unknown
  > | null>(null);

  // White-label config (served from advisors table via /api/profile/white-label)
  const [wlConfig, setWlConfig] = useState<{
    white_label_enabled: boolean;
    firm_name: string | null;
    advisor_name: string | null;
    logo_base64?: string | null;
    firm_logo_url?: string;
    advisor_email?: string;
    brand_color?: string | null;
    brand_primary_color?: string | null;
  } | null>(null);
  const [useWhiteLabel, setUseWhiteLabel] = useState(false);

  const fileSize = useMemo(
    () => (file ? `${(file.size / 1024).toFixed(1)} KB` : ""),
    [file],
  );
  const portfolioId = result?.portfolio_id ?? null;
  const riskLevel = useMemo(() => {
    const score = result?.dna_score ?? 0;
    if (score >= 70) return "Low";
    if (score >= 40) return "Moderate";
    return "High";
  }, [result?.dna_score]);
  const isAdvisorPlan = plan === "advisor" || plan === "enterprise";

  const activeStageIndex = useMemo(() => {
    const idx = STAGES.findIndex((s) => s.label === stage);
    return idx >= 0 ? idx : 0;
  }, [stage]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f?.name.toLowerCase().endsWith(".csv") && f.size <= 10 * 1024 * 1024)
      setFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f?.name.toLowerCase().endsWith(".csv") && f.size <= 10 * 1024 * 1024)
      setFile(f);
  };

  const runAnalyze = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    let i = 0;
    const timer = window.setInterval(() => {
      const s = STAGES[Math.min(i, STAGES.length - 1)];
      setStage(s.label);
      setProgress(s.pct);
      i += 1;
    }, 1800);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/analyze-dna", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (res.status === 402) {
        const payload = await res.json().catch(() => ({}) as any);
        const checkoutUrl =
          payload?.checkout_url ??
          payload?.detail?.checkout_url ??
          payload?.detail?.upgrade_url ??
          null;
        if (typeof checkoutUrl === "string" && checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
        toast.error("Trial expired. Subscribe to upload a new portfolio.");
        return;
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}) as any);
        toast.error(
          typeof payload?.detail === "string"
            ? payload.detail
            : "Upload failed. Try again.",
        );
        return;
      }

      const data = (await res.json()) as DNAAnalysisResponse;
      setResult(data);
      try {
        const serialised = JSON.stringify(data);
        localStorage.setItem("neufin-last-analysis", serialised);
        // Also write to the key the swarm page reads from
        localStorage.setItem("dnaResult", serialised);
      } catch {
        // Ignore circular reference errors from React-decorated objects
      }
      setProgress(100);
      // Advance to step 2 — swarm IC analysis is now available
      setStep("dna_complete");
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!result?.dna_score) {
      setDisplayScore(0);
      return;
    }
    const score = result.dna_score;
    const duration = 1500;
    const steps = 60;
    const increment = score / steps;
    let current = 0;
    const timer = window.setInterval(() => {
      current += increment;
      if (current >= score) {
        setDisplayScore(score);
        window.clearInterval(timer);
      } else {
        setDisplayScore(Math.floor(current));
      }
    }, duration / steps);
    return () => window.clearInterval(timer);
  }, [result?.dna_score]);

  useEffect(() => {
    if (!result) return;
    apiGet<{ plan: "free" | "retail" | "advisor" | "enterprise" }>(
      "/api/subscription/status",
    )
      .then((res) => setPlan(res.plan))
      .catch(() => setPlan("free"));
  }, [result]);

  // Load white-label config once on mount
  useEffect(() => {
    apiGet<{
      white_label_enabled: boolean;
      firm_name: string | null;
      advisor_name: string | null;
      logo_base64?: string | null;
      firm_logo_url?: string;
      advisor_email?: string;
      brand_color?: string | null;
      brand_primary_color?: string | null;
    }>("/api/profile/white-label")
      .then((data) => {
        setWlConfig(data);
        if (data.white_label_enabled) setUseWhiteLabel(true);
      })
      .catch(() => {
        /* non-critical */
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("neufin-last-swarm-result");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setSwarmResult(parsed);
      // If we have both DNA and swarm results, advance the step indicator
      setStep((prev) => (prev === "idle" ? "swarm_complete" : prev));
    } catch {
      setSwarmResult(null);
    }
  }, []);

  useEffect(() => {
    if (!result) {
      setReportAt(null);
      return;
    }
    setReportAt(
      new Date().toLocaleString("en-SG", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  }, [result]);

  const handleDownloadReport = async (theme?: ReportTheme) => {
    if (!portfolioId) {
      toast.error("Portfolio ID missing. Re-run analysis and try again.");
      return;
    }

    const resolvedTheme = theme ?? getStoredReportTheme();
    try {
      setDownloadLoading(true);
      const statusRes = await apiGet<{
        plan: "free" | "retail" | "advisor" | "enterprise";
        status?: string;
      }>("/api/subscription/status");
      const currentPlan = statusRes.plan;
      setPlan(currentPlan);

      const canGeneratePdf =
        currentPlan === "advisor" ||
        currentPlan === "enterprise" ||
        statusRes.status === "trial";

      if (canGeneratePdf) {
        const reportBody: Record<string, unknown> = {
          portfolio_id: portfolioId,
          inline_pdf: false,
          theme: resolvedTheme,
        };
        if (useWhiteLabel && wlConfig?.white_label_enabled) {
          reportBody.firm_name = wlConfig.firm_name ?? undefined;
          reportBody.advisor_name = wlConfig.advisor_name ?? undefined;
          reportBody.advisor_email = wlConfig.advisor_email;
          reportBody.logo_base64 = wlConfig.logo_base64 || undefined;
          reportBody.advisor_logo_url = wlConfig.firm_logo_url || undefined;
          reportBody.white_label = true;
          const primary = wlConfig.brand_color || wlConfig.brand_primary_color;
          if (primary) reportBody.color_scheme = { primary };
        }
        const res = await apiFetch("/api/reports/generate", {
          method: "POST",
          body: JSON.stringify(reportBody),
        });

        const data = (await res.json()) as {
          pdf_url?: string | null;
          pdf_base64?: string | null;
          filename?: string | null;
          checkout_url?: string | null;
          error?: string;
          message?: string;
        };

        if (!res.ok) {
          const errMsg = data?.message || data?.error || `HTTP ${res.status}`;
          toast.error(`Report failed: ${errMsg}`);
          console.error("[report] error response:", data);
          return;
        }

        // Stripe checkout for paid users
        if (data.checkout_url) {
          window.location.href = data.checkout_url;
          return;
        }

        // Supabase storage signed URL
        if (data.pdf_url) {
          window.open(data.pdf_url, "_blank");
          setStep("report_ready");
          return;
        }

        // Base64 fallback (storage upload failed)
        if (data.pdf_base64) {
          const bytes = Uint8Array.from(atob(data.pdf_base64), (c) =>
            c.charCodeAt(0),
          );
          const blob = new Blob([bytes], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download =
            data.filename || `neufin-report-${portfolioId.slice(0, 8)}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setStep("report_ready");
          return;
        }

        console.error("[report] no delivery method in response:", data);
        toast.error("Report URL unavailable. Try again.");
      } else {
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        const { checkout_url } = await apiPost<{ checkout_url: string }>(
          "/api/reports/checkout",
          {
            plan: "single",
            portfolio_id: portfolioId,
            success_url: stripeSuccessUrlReports(origin),
            cancel_url: `${origin}/dashboard/portfolio`,
          },
        );
        window.location.href = checkout_url;
      }
    } catch (err) {
      console.error("[report] error:", err);
      toast.error("Report unavailable. Try again.");
    } finally {
      setDownloadLoading(false);
    }
  };

  const insightItems = useMemo(
    () =>
      [
        ...(result?.strengths || []),
        ...(result?.weaknesses || []),
        result?.recommendation,
      ]
        .filter(Boolean)
        .slice(0, 3),
    [result],
  );

  const metricEntries = useMemo(() => {
    if (!result) return [];
    const multi = Boolean(result.multi_currency_portfolio);
    const rows: { label: string; value: string }[] = [
      {
        label: "Total Value",
        value: formatPortfolioTotalLine({
          totalValue: result.total_value,
          multiCurrency: multi,
          portfolioCurrencies: result.portfolio_currencies,
        }),
      },
      { label: "Positions", value: String(result.num_positions) },
      {
        label: "Max Position %",
        value: `${result.max_position_pct.toFixed(1)}%`,
      },
    ];
    if ("weighted_beta" in result) {
      rows.push({
        label: "Weighted Beta",
        value: String(
          (result as DNAAnalysisResponse & { weighted_beta?: unknown })
            .weighted_beta,
        ),
      });
    }
    if ("avg_correlation" in result) {
      rows.push({
        label: "Avg Correlation",
        value: String(
          (result as DNAAnalysisResponse & { avg_correlation?: unknown })
            .avg_correlation,
        ),
      });
    }
    if ("num_priced" in result) {
      rows.push({
        label: "Priced Tickers",
        value: String((result as DNAAnalysisResponse).num_priced),
      });
    }
    return rows;
  }, [result]);

  const piePositions = useMemo(() => {
    if (!result?.positions?.length) return [];
    // PortfolioPie expects weight as a 0–100 percent value for its pct formatter.
    return result.positions.map((p) => ({
      ...p,
      weight: p.weight * 100,
    })) as Position[];
  }, [result?.positions]);

  return (
    <div className="space-y-5">
      {/* 3-step analysis progress indicator — always visible */}
      <StepIndicator step={step} />

      <FinancialModelSelector portfolioId={portfolioId} defaultCollapsed />

      {/* Upload zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-surface/50 hover:border-primary/40 hover:bg-surface"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={onPick}
          className="hidden"
        />
        {!file ? (
          <>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-2">
              <UploadCloud
                className="h-7 w-7 text-muted-foreground"
                strokeWidth={1.5}
              />
            </div>
            <p className="mb-1 text-lg font-semibold text-foreground">
              Drop your portfolio CSV
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              or click to browse
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="rounded border border-border/50 bg-surface-2 px-2 py-0.5 font-mono text-sm text-muted-foreground/60">
                .CSV
              </span>
              <span className="rounded border border-border/50 bg-surface-2 px-2 py-0.5 font-mono text-sm text-muted-foreground/60">
                .XLSX
              </span>
              <span className="rounded border border-border/50 bg-surface-2 px-2 py-0.5 font-mono text-sm text-muted-foreground/60">
                MAX 10MB
              </span>
            </div>
          </>
        ) : (
          <div
            className="w-full max-w-md rounded-lg border border-border bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-positive/10">
                <FileSpreadsheet className="h-5 w-5 text-positive" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </p>
                <p className="text-sm text-muted-foreground">{fileSize}</p>
              </div>
              <span className="shrink-0 rounded px-2 py-0.5 font-mono text-sm text-positive bg-positive/10">
                Ready to analyze
              </span>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void runAnalyze();
        }}
        disabled={!file || busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          "Analyze Portfolio"
        )}
      </button>

      {busy && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="mb-6 text-sm font-mono uppercase tracking-widest text-muted-foreground">
            Analysis in progress
          </p>
          <div className="space-y-0">
            {STAGES.map((s, j) => {
              const done = j < activeStageIndex;
              const active = j === activeStageIndex && busy;
              return (
                <div
                  key={s.label}
                  className="flex items-center gap-3 border-b border-border/40 py-3 last:border-0"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                      done
                        ? "border-positive/50 bg-positive/20 text-positive"
                        : active
                          ? "border-primary/50 bg-primary/20 text-primary"
                          : "border-border/50 bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      j + 1
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {s.label}
                    </p>
                    <p className="text-sm text-muted-foreground/60">{s.sub}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {done ? (
                      <Check
                        className="ml-auto h-4 w-4 text-positive"
                        strokeWidth={2}
                      />
                    ) : active ? (
                      <span className="font-mono text-sm text-primary">
                        {progress}%
                      </span>
                    ) : (
                      <span className="font-mono text-sm text-muted-foreground/50">
                        —
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.7 }}
            />
          </div>
        </div>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
              Portfolio intelligence report
            </span>
            <span className="font-mono text-sm text-muted-foreground/80">
              {reportAt ?? "—"}
            </span>
          </div>

          {/* DNA score ring */}
          <div className="flex flex-col items-center">
            <div className="relative flex h-[140px] w-[140px] items-center justify-center">
              <svg
                width="140"
                height="140"
                viewBox="0 0 140 140"
                className="absolute inset-0"
              >
                <circle
                  cx="70"
                  cy="70"
                  r="58"
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="12"
                />
                <circle
                  cx="70"
                  cy="70"
                  r="58"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - displayScore / 100)}
                  transform="rotate(-90 70 70)"
                  className="transition-[stroke-dashoffset] duration-700"
                />
              </svg>
              <div className="relative z-10 flex flex-col items-center">
                <motion.span className="font-finance text-4xl font-bold tabular-nums text-foreground">
                  {displayScore}
                </motion.span>
                <span className="text-sm text-muted-foreground">/100</span>
              </div>
            </div>
            <p className="mt-2 text-center text-sm font-mono tracking-widest text-muted-foreground">
              Portfolio DNA score
            </p>
          </div>

          {piePositions.length ? (
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                  PORTFOLIO COMPOSITION
                </span>
                <span className="text-sm text-muted-foreground">
                  Top holdings by value
                </span>
              </div>
              <PortfolioPie positions={piePositions} />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                {result.investor_type}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Investor profile
              </p>
            </div>
            <div className="flex items-start justify-end">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-mono font-medium ${
                  riskLevel === "Low"
                    ? "border-positive/30 bg-positive/10 text-positive"
                    : riskLevel === "Moderate"
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-risk/30 bg-risk/10 text-risk"
                }`}
              >
                Risk: {riskLevel}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {metricEntries.map((m) => (
              <KPICard key={m.label} title={m.label} value={m.value} compact />
            ))}
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-accent" />
              <span className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                AI insights
              </span>
            </div>
            <div className="space-y-2">
              {insightItems.map((rec, i) => (
                <div
                  key={i}
                  className="rounded-r-lg border border-border border-l-2 border-l-accent/50 bg-surface-2 p-3 text-sm leading-relaxed text-muted-foreground"
                >
                  {rec}
                </div>
              ))}
            </div>
          </div>

          {!!result.positions?.length && (
            <div className="relative overflow-hidden rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-2 text-sm uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Symbol</th>
                    <th className="px-4 py-3 text-right">Shares</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {result.positions.slice(0, 10).map((p) => (
                    <tr
                      key={p.symbol}
                      className="border-b border-border/40 hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3 font-mono">{p.symbol}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {p.shares.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatNativePrice(p.price, p.native_currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatNativeValue(p.value, p.native_currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {(p.weight * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result?.positions?.length ? (
            <section className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium text-white">Chart Lab</h2>
                <span className="text-xs text-shell-subtle">
                  AI-enriched · Swarm annotations active
                </span>
              </div>
              <ChartLab
                positions={result.positions.map((p) => ({
                  symbol: p.symbol,
                  shares: p.shares,
                  weight: p.weight,
                }))}
                portfolioId={result.portfolio_id ?? ""}
                swarmResult={swarmResult}
              />
            </section>
          ) : null}

          {/* White-label toggle — only shown when branding is configured */}
          {wlConfig?.white_label_enabled && (
            <div
              className="mt-5 flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "#161D2E", border: "1px solid #2A3550" }}
            >
              <input
                type="checkbox"
                id="wl-toggle"
                checked={useWhiteLabel}
                onChange={(e) => setUseWhiteLabel(e.target.checked)}
                className="w-4 h-4 accent-teal-400 cursor-pointer"
              />
              <label
                htmlFor="wl-toggle"
                className="text-sm cursor-pointer select-none"
                style={{ color: "#F0F4FF" }}
              >
                White-label this report with{" "}
                <strong>{wlConfig.firm_name || "your firm"}</strong> branding
              </label>
              {(wlConfig.logo_base64 || wlConfig.firm_logo_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    wlConfig.logo_base64
                      ? `data:image/png;base64,${wlConfig.logo_base64}`
                      : (wlConfig.firm_logo_url as string)
                  }
                  alt="Firm logo"
                  style={{
                    height: 24,
                    marginLeft: "auto",
                    objectFit: "contain",
                  }}
                />
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                try {
                  const serialised = JSON.stringify(result);
                  localStorage.setItem("neufin-last-analysis", serialised);
                  localStorage.setItem("dnaResult", serialised);
                } catch {
                  // Ignore circular reference errors from React-decorated objects
                }
              }}
              className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
            >
              Save Analysis
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadReport()}
              disabled={downloadLoading || !portfolioId}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                isAdvisorPlan
                  ? "bg-primary text-primary-foreground"
                  : "bg-warning text-[var(--text-primary)]"
              }`}
            >
              {downloadLoading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Preparing report...
                </>
              ) : isAdvisorPlan ? (
                "Download PDF"
              ) : (
                "Get Full Report — $49"
              )}
            </button>
            {!isAdvisorPlan && (
              <Link
                href="/pricing"
                className="rounded-lg border border-border px-4 py-2 text-sm text-primary"
              >
                Advisor report available on Pro plan
              </Link>
            )}
          </div>

          {/* Context-aware IC Analysis CTA based on current step */}
          {step === "dna_complete" && (
            <div
              style={{
                marginTop: 8,
                padding: "16px 20px",
                background: "var(--surface)",
                border:
                  "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
                borderRadius: 10,
              }}
            >
              <p className="mb-1 text-sm font-semibold text-foreground">
                Step 2 unlocked — Run IC Analysis
              </p>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  marginBottom: 12,
                }}
              >
                Your DNA score is ready. Run the 7-agent IC Analysis to unlock
                the full swarm briefing, macro regime, alpha signals, and an
                IC-grade investment memo.
              </p>
              <Link
                href="/dashboard/swarm"
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                style={{
                  background: "var(--primary)",
                  color: "#ffffff",
                }}
              >
                Run IC Analysis — 7-Agent Swarm →
              </Link>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  marginTop: 6,
                }}
              >
                ~90 seconds · Required for the full 10-page IC report
              </p>
            </div>
          )}
          {step === "swarm_complete" && (
            <div
              style={{
                marginTop: 8,
                padding: "16px 20px",
                background: "var(--surface)",
                border:
                  "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
                borderRadius: 10,
              }}
            >
              <p className="mb-1 text-sm font-semibold text-foreground">
                Step 3 unlocked — Generate IC Report PDF
              </p>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  marginBottom: 12,
                }}
              >
                IC Analysis complete. Generate the full 10-page IC memo
                combining DNA + Swarm analysis.
              </p>
              <button
                type="button"
                onClick={() => void handleDownloadReport()}
                disabled={downloadLoading || !portfolioId}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  background: "var(--primary)",
                  color: "#ffffff",
                }}
              >
                {downloadLoading ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Preparing report...
                  </>
                ) : (
                  "Generate IC Report PDF →"
                )}
              </button>
            </div>
          )}
          {step === "report_ready" && (
            <div
              style={{
                marginTop: 8,
                padding: "14px 20px",
                background: "rgba(22,163,74,0.06)",
                border: "1px solid rgba(22,163,74,0.28)",
                borderRadius: 10,
                color: "#16A34A",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ✓ IC Report generated — check your downloads or the open tab.
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
