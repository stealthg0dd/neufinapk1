"use client";

import {
  Suspense,
  useState,
  useEffect,
  useMemo,
  useRef,
  startTransition,
  DragEvent,
  ChangeEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  ConnectionPathCards,
  type ConnectionHubPath,
} from "@/components/upload/ConnectionPathCards";
import { isPlaidConnectEnabled } from "@/lib/featureFlags";

const SAMPLE_CSV = `symbol,shares,cost_basis
AAPL,10,145.50
MSFT,5,280.00
GOOGL,3,130.00
NVDA,8,420.00
JPM,12,155.00
`;

function UploadInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const { capture } = useNeufinAnalytics();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isVnPortfolio, setIsVnPortfolio] = useState(false);
  const plaidEnabled = isPlaidConnectEnabled();
  const path: ConnectionHubPath = useMemo(() => {
    const method = searchParams.get("method");
    if (method === "broker" && plaidEnabled) return "broker";
    return "upload";
  }, [searchParams, plaidEnabled]);

  useEffect(() => {
    startTransition(() => {
      if (!file) {
        setIsVnPortfolio(false);
        return;
      }
      const isViLocale =
        typeof navigator !== "undefined" && navigator.language.startsWith("vi");
      if (isViLocale) {
        setIsVnPortfolio(true);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) ?? "";
        setIsVnPortfolio(/\b[A-Z0-9]{1,10}\.VN\b/i.test(text));
      };
      reader.readAsText(file);
    });
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
      perfTimer.end("dna_score");
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

  const selectBroker = () => {
    if (!plaidEnabled) return;
    router.replace("/upload?method=broker", { scroll: false });
  };

  const selectUpload = () => {
    router.replace("/upload?method=upload", { scroll: false });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <nav className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
          <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-4 px-4 sm:px-6">
            <BrandLogo variant="marketing-nav" href={null} priority />
          </div>
        </nav>
        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
          <div className="w-full max-w-2xl space-y-5">
            <div className="mb-8 space-y-2 text-center">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
                AI is analyzing your portfolio…
              </div>
              <p className="text-xs text-muted-foreground">
                This usually takes 5–10 seconds
              </p>
            </div>

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
                <div key={i} className="flex items-center gap-3">
                  <div className="shimmer h-4 w-4 shrink-0 rounded-full" />
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Suspense fallback={null}>
        <RefCapture />
      </Suspense>
      <nav className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
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
        <div className="w-full max-w-5xl">
          <h1 className="mb-2 text-3xl font-bold text-foreground">Add your portfolio</h1>
          <p className="mb-6 text-muted-foreground">
            Choose how to bring holdings into NeuFin, then continue with the same DNA
            analysis as before.
          </p>

          <ConnectionPathCards
            variant="interactive"
            activePath={path}
            onSelectBroker={selectBroker}
            onSelectUpload={selectUpload}
            plaidEnabled={plaidEnabled}
          />

          {path === "broker" && plaidEnabled && (
            <section
              id="portfolio-connection-detail"
              className="mt-6 rounded-2xl border border-primary/25 bg-primary-light/20 p-6 text-sm text-foreground"
            >
              <h2 className="text-lg font-semibold text-foreground">
                Secure brokerage connection
              </h2>
              <p className="mt-2 text-muted-foreground">
                Plaid Link will open from this step once your deployment completes the
                server-side token exchange. Until then, use{" "}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                  onClick={selectUpload}
                >
                  file upload
                </button>{" "}
                or{" "}
                <Link href="/dashboard/raw-input" className="font-semibold text-primary underline-offset-2 hover:underline">
                  raw paste
                </Link>
                .
              </p>
            </section>
          )}

          {path === "upload" && (
            <>
              <h2 className="mb-2 mt-10 text-xl font-semibold text-foreground">
                Upload your portfolio
              </h2>
              <p className="text-muted-foreground mb-4">
                CSV with columns: <code className="text-primary">symbol</code>,{" "}
                <code className="text-primary">shares</code>, and optional{" "}
                <code className="text-primary">cost_basis</code>
              </p>
              <div className="mb-6 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-foreground shadow-sm">
                <p className="mb-1.5 font-semibold text-foreground">
                  SEA &amp; international markets supported
                </p>
                <p className="leading-relaxed text-foreground/90">
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
                  <span className="font-mono font-medium text-primary">VCB.VN</span>,{" "}
                  <span className="font-mono font-medium text-primary">D05.SI</span>,{" "}
                  <span className="font-mono font-medium text-primary">1155.KL</span>
                </p>
              </div>

              <p className="mb-3 text-center text-sm text-muted-foreground">
                Have holdings in a different format?{" "}
                <Link
                  href="/dashboard/raw-input"
                  className="font-medium text-primary hover:underline"
                >
                  Try our Raw Paste engine →
                </Link>
              </p>

              <div
                onClick={() => inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                className={`relative cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all duration-200
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
                    <div className="mb-3 text-4xl">✅</div>
                    <p className="font-semibold text-green-400">{file.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB · Ready to analyze
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-3 text-4xl">📂</div>
                    <p className="font-semibold text-foreground">Drop your CSV here</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      or click to browse
                    </p>
                  </>
                )}
              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {isVnPortfolio && (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#0EA5E9]/40 bg-[#0EA5E9]/8 px-4 py-3 text-sm">
                  <span className="mt-0.5 shrink-0 text-[#38BDF8]">🇻🇳</span>
                  <div>
                    <p className="font-semibold text-[#38BDF8]">
                      Detected Vietnamese portfolio
                    </p>
                    <p className="mt-0.5 leading-relaxed text-foreground/80">
                      We support HOSE/HNX tickers, VND→USD conversion, and VN-Index
                      benchmarking. Add a{" "}
                      <code className="font-mono text-primary">cost_basis_vnd</code>{" "}
                      column for full Vietnam securities transfer tax analysis.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-4 rounded-xl border border-border bg-surface-2 p-4">
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

                <div className="flex items-center justify-center pt-6">
                  <span className="text-xl font-bold text-primary">→</span>
                </div>

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

              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={!file || loading}
                  className={`btn-primary flex w-full items-center justify-center gap-2 py-4 text-base
                ${!file || loading ? "cursor-not-allowed opacity-50" : ""}`}
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

              <div className="mt-6 rounded-xl border border-border bg-surface-2 p-5 text-sm text-foreground shadow-sm">
                <p className="mb-2 font-medium text-foreground">Expected CSV format:</p>
                <pre className="text-xs leading-relaxed text-muted-foreground font-mono">
                  {SAMPLE_CSV.trim()}
                </pre>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-background text-muted-foreground">
          Loading…
        </div>
      }
    >
      <UploadInner />
    </Suspense>
  );
}
