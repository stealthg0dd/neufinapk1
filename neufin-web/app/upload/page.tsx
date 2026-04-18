"use client";

import { Suspense, useState, useRef, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { analyzeDNA } from "@/lib/api";
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
      setError(
        e instanceof Error ? e.message : "Analysis failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-shell text-shell-fg">
        <nav className="border-b border-shell-border/60 bg-shell-deep/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
            <BrandLogo variant="shell-inverted" href={null} priority />
          </div>
        </nav>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-xl space-y-5">
            {/* Status header */}
            <div className="text-center space-y-2 mb-8">
              <div className="inline-flex items-center gap-2 text-primary text-sm font-medium">
                <span className="inline-block w-3.5 h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                AI is analyzing your portfolio…
              </div>
              <p className="text-xs text-shell-subtle">
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
    <div className="min-h-screen flex flex-col bg-shell text-shell-fg">
      <Suspense fallback={null}>
        <RefCapture />
      </Suspense>
      <nav className="border-b border-shell-border/60 bg-shell-deep/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link
            href="/"
            className="text-shell-muted hover:text-white transition-colors text-sm"
          >
            ← Back
          </Link>
          <BrandLogo variant="shell-inverted" href="/" />
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <h1 className="text-3xl font-bold mb-2 text-shell-fg">Upload your portfolio</h1>
          <p className="text-shell-muted mb-4">
            CSV with columns: <code className="text-primary">symbol</code>,{" "}
            <code className="text-primary">shares</code>, and optional{" "}
            <code className="text-primary">cost_basis</code>
          </p>
          <div className="mb-6 rounded-lg border border-shell-border/60 bg-shell-raised/30 px-4 py-3 text-xs text-shell-muted">
            <p className="font-semibold text-shell-fg mb-1">SEA &amp; international markets supported</p>
            <p>Use exchange suffixes for non-US tickers — the system auto-detects currency from your symbols:</p>
            <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-primary">
              <li>.SI → SGD (Singapore)</li>
              <li>.VN → VND (Vietnam)</li>
              <li>.KL → MYR (Malaysia)</li>
              <li>.BK → THB (Thailand)</li>
              <li>.HK → HKD (Hong Kong)</li>
              <li>.L → GBP (London)</li>
            </ul>
            <p className="mt-1.5">Example: <span className="text-primary font-mono">VCB.VN</span>, <span className="text-primary font-mono">D05.SI</span>, <span className="text-primary font-mono">1155.KL</span></p>
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
              ${dragging ? "border-primary bg-primary/5" : "border-shell-border hover:border-shell-muted hover:bg-shell/50"}
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
                <p className="text-sm text-shell-subtle mt-1">
                  {(file.size / 1024).toFixed(1)} KB · Ready to analyze
                </p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">📂</div>
                <p className="font-semibold text-shell-fg/90">
                  Drop your CSV here
                </p>
                <p className="text-sm text-shell-subtle mt-1">
                  or click to browse
                </p>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

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
              className="btn-outline-on-dark w-full py-3 text-sm"
            >
              Download sample CSV
            </button>
          </div>

          {/* Format hint */}
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.06] p-5 text-sm text-shell-fg shadow-sm backdrop-blur-sm">
            <p className="text-shell-fg/90 font-medium mb-2">
              Expected CSV format:
            </p>
            <pre className="text-xs text-shell-muted font-mono leading-relaxed">
              {SAMPLE_CSV.trim()}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
