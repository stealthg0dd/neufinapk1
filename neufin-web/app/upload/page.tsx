"use client";

import { Suspense, useState, useEffect, useRef, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { analyzeDNA, SubscriptionRequiredError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import RefCapture from "@/components/RefCapture";
import { trackEvent, EVENTS } from "@/components/Analytics";
import {
  useNeufinAnalytics,
  perfTimer,
  captureSentrySlowOp,
} from "@/lib/analytics";

const SAMPLE_CSV = `symbol,shares,cost_basis
AAPL,10,145.50
MSFT,5,280.00
GOOGL,3,130.00
NVDA,8,420.00
JPM,12,155.00
`;

export default function UploadPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { capture } = useNeufinAnalytics();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isVnPortfolio, setIsVnPortfolio] = useState(false);

  useEffect(() => {
    if (!file) { setIsVnPortfolio(false); return; }
    const isViLocale =
      typeof navigator !== "undefined" && navigator.language.startsWith("vi");
    if (isViLocale) { setIsVnPortfolio(true); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      setIsVnPortfolio(/\b[A-Z0-9]{1,10}\.VN\b/i.test(text));
    };
    reader.readAsText(file);
  }, [file]);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.endsWith(".csv")) setFile(dropped);
    else setError("Please upload a .csv file");
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError("");
    }
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-portfolio.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    const fileSizeKb = Math.round(file.size / 1024);
    capture("csv_upload_started", {});
    perfTimer.start("dna_score");
    trackEvent(EVENTS.UPLOAD_STARTED, { size_kb: fileSizeKb });
    try {
      const result = await analyzeDNA(file, token);
      const durationMs = perfTimer.end("dna_score") ?? 0;
      localStorage.setItem("dnaResult", JSON.stringify(result));
      capture("csv_upload_completed", {
        ticker_count: result.num_positions,
        file_size_kb: fileSizeKb,
      });
      capture("dna_score_generated", {
        score: result.dna_score,
        risk_level: result.investor_type,
        ticker_count: result.num_positions,
        is_authenticated: !!token,
        duration_ms: durationMs,
      });
      captureSentrySlowOp("dna_score", durationMs);
      router.push("/results");
    } catch (e: unknown) {
      perfTimer.end("dna_score"); // clean up timer
      capture("csv_upload_failed", {
        error_reason: e instanceof Error ? e.message : "unknown",
      });
      if (e instanceof SubscriptionRequiredError) {
        if (e.checkoutUrl) {
          window.location.href = e.checkoutUrl;
          return;
        }
        router.push(e.upgradeUrl);
        return;
      }
      setError(
        e instanceof Error ? e.message : "Analysis failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <nav className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-10">
          <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-4 px-4 sm:px-6">
            <BrandLogo variant="marketing-nav" href={null} priority />
          </div>
        </nav>
        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
          <div className="w-full max-w-2xl space-y-5">
            {/* Status header */}
            <div className="text-center space-y-2 mb-8">
              <div className="inline-flex items-center gap-2 text-primary text-sm font-medium">
                <span className="inline-block w-3.5 h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                AI is analyzing your portfolio…
              </div>
              <p className="text-xs text-muted-foreground">
                This usually takes 5–10 seconds
              </p>
            </div>

            {/* Shimmer skeleton cards */}
            <div className="card space-y-3">
              <div className="shimmer h-3 w-1/3 rounded" />
              <div className="shimmer h-8 w-2/3 rounded" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card space-y-2">
                  <div className="shimmer h-2.5 w-3/4 rounded" />
                  <div className="shimmer h-6 w-full rounded" />
                </div>
              ))}
            </div>

            <div className="card space-y-2.5">
              <div className="shimmer h-2.5 w-1/4 rounded" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 items-center">
                  <div className="shimmer h-4 w-4 rounded-full shrink-0" />
                  <div className="shimmer h-3 flex-1 rounded" />
                </div>
              ))}
            </div>

            <div className="card space-y-2">
              <div className="shimmer h-2.5 w-1/3 rounded" />
              <div className="shimmer h-3 w-full rounded" />
              <div className="shimmer h-3 w-5/6 rounded" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Suspense fallback={null}>
        <RefCapture />
      </Suspense>
      <nav className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back
          </Link>
          <BrandLogo variant="marketing-nav" href="/" />
        </div>
      </nav>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full max-w-2xl">
          <h1 className="text-3xl font-bold mb-2 text-foreground">Upload your portfolio</h1>
          <p className="text-muted-foreground mb-4">
            CSV with columns: <code className="text-primary">symbol</code>,{" "}
            <code className="text-primary">shares</code>, and optional{" "}
            <code className="text-primary">cost_basis</code>
          </p>
          {/* SEA-TICKER-FIX: high-contrast callout — shell-muted was illegible on shell bg */}
          <div className="mb-6 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-foreground shadow-sm">
            <p className="font-semibold text-foreground mb-1.5">
              SEA &amp; international markets supported
            </p>
            <p className="text-foreground/90 leading-relaxed">
              Use exchange suffixes for non-US tickers — the system auto-detects
              currency from your symbols:
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm text-foreground [&_li]:tracking-tight">
              <li>.SI → SGD (Singapore)</li>
              <li>.VN → VND (Vietnam)</li>
              <li>.KL → MYR (Malaysia)</li>
              <li>.BK → THB (Thailand)</li>
              <li>.HK → HKD (Hong Kong)</li>
              <li>.L → GBP (London)</li>
            </ul>
            <p className="mt-2 text-foreground/90">
              Example:{" "}
              <span className="font-mono text-primary font-medium">VCB.VN</span>,{" "}
              <span className="font-mono text-primary font-medium">D05.SI</span>,{" "}
              <span className="font-mono text-primary font-medium">1155.KL</span>
            </p>
          </div>

          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200
              ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-surface-2"}
              ${file ? "border-green-600/60 bg-green-500/5" : ""}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={handleChange}
              className="hidden"
            />
            {file ? (
              <>
                <div className="text-4xl mb-3">✅</div>
                <p className="font-semibold text-green-400">{file.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(file.size / 1024).toFixed(1)} KB · Ready to analyze
                </p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">📂</div>
                <p className="font-semibold text-foreground">
                  Drop your CSV here
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  or click to browse
                </p>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* VN portfolio detection banner */}
          {isVnPortfolio && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#0EA5E9]/40 bg-[#0EA5E9]/8 px-4 py-3 text-sm">
              <span className="mt-0.5 shrink-0 text-[#38BDF8]">🇻🇳</span>
              <div>
                <p className="font-semibold text-[#38BDF8]">
                  Detected Vietnamese portfolio
                </p>
                <p className="mt-0.5 text-foreground/80 leading-relaxed">
                  We support HOSE/HNX tickers, VND→USD conversion, and VN-Index
                  benchmarking. Add a{" "}
                  <code className="text-primary font-mono">cost_basis_vnd</code>{" "}
                  column for full Vietnam securities transfer tax analysis.
                </p>
              </div>
            </div>
          )}

          {/* ── DNA → Swarm two-step explainer ─────────────────────────── */}
          <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-4 rounded-xl border border-border bg-surface-2 p-4">
            {/* Step 1 */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                Step 1 · DNA Analysis
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                Free · ~5 seconds
              </p>
              <ul className="space-y-1">
                {[
                  "Behavioral fingerprint (47 biases)",
                  "Concentration & correlation score",
                  "Investor archetype classification",
                  "Basic rebalancing signals",
                  "Churn risk score",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1.5 text-xs text-foreground/80"
                  >
                    <span className="mt-0.5 text-emerald-500">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center pt-6">
              <span className="text-xl text-primary font-bold">→</span>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-500">
                Step 2 · Swarm IC
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                Advisor tier · ~60 seconds
              </p>
              <ul className="space-y-1">
                {[
                  "7 AI agents cross-examine portfolio",
                  "Macro regime alignment check",
                  "Tax-lot optimisation",
                  "Full IC memo",
                  "White-label PDF export",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1.5 text-xs text-foreground/80"
                  >
                    <span className="mt-0.5 text-amber-400">✦</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={handleSubmit}
              disabled={!file || loading}
              className={`btn-primary w-full text-base py-4 flex items-center justify-center gap-2
                ${!file || loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              Analyze My Portfolio →
            </button>

            <button
              type="button"
              onClick={downloadSample}
              className="btn-secondary w-full py-3 text-sm"
            >
              Download sample CSV
            </button>
          </div>

          {/* Format hint */}
          <div className="mt-6 rounded-xl border border-border bg-surface-2 p-5 text-sm text-foreground shadow-sm">
            <p className="text-foreground font-medium mb-2">
              Expected CSV format:
            </p>
            <pre className="text-xs text-muted-foreground font-mono leading-relaxed">
              {SAMPLE_CSV.trim()}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
