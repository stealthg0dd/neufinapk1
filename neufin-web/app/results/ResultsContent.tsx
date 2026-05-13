"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { fulfillReport } from "@/lib/api";
import { getSubscriptionStatus } from "@/lib/api";
import SocialProof from "@/components/SocialProof";
import AdvisorCTA from "@/components/AdvisorCTA";
import { trackEvent, EVENTS } from "@/components/Analytics";
import { useAuth } from "@/lib/auth-context";
import { useAnalytics } from "@/lib/posthog";
import { useNeufinAnalytics } from "@/lib/analytics";
import type { DNAAnalysisResponse } from "@/lib/api";
import { PortfolioIntelligenceProvider } from "@/components/dashboard/PortfolioIntelligenceContext";
import { NextPrimaryAction } from "@/components/dashboard/NextPrimaryAction";
import {
  formatNativePrice,
  formatPortfolioTotalLine,
  formatPositionValuePrimary,
  shouldShowFxHint,
  isUnresolved,
  BENCHMARK_LABELS,
} from "@/lib/finance-content";
// SEA-NATIVE-CURRENCY-FIX: market-aware display components
import { MarketBadge, QuoteUnavailableBadge, BenchmarkLabel, RegionalContext, CountryExposure } from "@/components/sea";
import { BenchmarkChart } from "@/components/benchmarking";
import { SwarmBrainPanel } from "@/components/swarm";

const PortfolioPie = nextDynamic(() => import("@/components/PortfolioPie"), {
  ssr: false,
});
const REF_STORAGE_KEY = "ref_token";

type SubscriptionState = {
  is_active?: boolean;
  tier?: "free" | "retail" | "advisor" | "enterprise";
  plan?: string;
  status?: "trial" | "active" | "expired";
  trial_active?: boolean;
  trial_ends_at?: string | null;
  trial_expired?: boolean;
  days_remaining?: number | null;
};

type AccessState = "loading" | "anonymous" | "trial" | "expired" | "paid";

const TYPE_COLORS: Record<string, string> = {
  "Diversified Strategist": "bg-primary/15 text-primary border-primary/30",
  "Conviction Growth": "bg-purple-500/15 text-purple-300 border-purple-500/30",
  "Momentum Trader": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  "Defensive Allocator": "bg-green-500/15 text-green-300 border-green-500/30",
  "Speculative Investor": "bg-red-500/15 text-red-300 border-red-500/30",
};

// ── Formatters ────────────────────────────────────────────────────────────────
const pct = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n / 100);

// ── Animation variants ────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

// ── Score circle ──────────────────────────────────────────────────────────────
function ScoreCircle({ score }: { score: number }) {
  const radius = 70;
  const circ = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circ);

  useEffect(() => {
    const t = setTimeout(() => setOffset(circ - (score / 100) * circ), 200);
    return () => clearTimeout(t);
  }, [score, circ]);

  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  const glowRgba =
    score >= 70
      ? "rgba(34,197,94,0.18)"
      : score >= 40
        ? "rgba(245,158,11,0.18)"
        : "rgba(239,68,68,0.18)";

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Radial glow matching score color */}
      <div
        className="absolute rounded-full"
        style={{
          width: 200,
          height: 200,
          background: `radial-gradient(circle, ${glowRgba} 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <svg width="180" height="180" className="-rotate-90">
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth="12"
        />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)",
            filter: `drop-shadow(0 0 6px ${color}88)`,
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-extrabold" style={{ color }}>
          {score}
        </span>
        <span className="text-xs uppercase tracking-widest text-muted2">
          DNA Score
        </span>
      </div>
    </div>
  );
}

// ── Score label ───────────────────────────────────────────────────────────────
function ScoreLabel({ score }: { score: number }) {
  if (score >= 70)
    return (
      <span className="text-xs text-green-400 font-semibold">
        Strong portfolio
      </span>
    );
  if (score >= 40)
    return (
      <span className="text-xs text-yellow-400 font-semibold">
        Room to improve
      </span>
    );
  return (
    <span className="text-xs text-red-400 font-semibold">
      High concentration risk
    </span>
  );
}

// ── Results content (client component) ────────────────────────────────────────
export default function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, loading: authLoading } = useAuth();
  const { track } = useAnalytics();
  const { capture } = useNeufinAnalytics();

  const [result, setResult] = useState<DNAAnalysisResponse | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fulfillLoading, setFulfillLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [refToken, setRefToken] = useState<string | null>(null);
  const [refDiscount, setRefDiscount] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | undefined>();

  useEffect(() => {
    const stored = localStorage.getItem("dnaResult");
    if (!stored) {
      router.replace("/upload");
      return;
    }

    let parsed: DNAAnalysisResponse;
    try {
      parsed = JSON.parse(stored);
      if (typeof parsed.dna_score !== "number") throw new Error("malformed");
    } catch {
      router.replace("/upload");
      return;
    }

    setResult(parsed);
    track("results_viewed", {
      dna_score: parsed.dna_score,
      investor_type: parsed.investor_type,
    });
    trackEvent(EVENTS.UPLOAD_COMPLETE, {
      dna_score: parsed.dna_score,
      investor_type: parsed.investor_type,
    });

    // Referral token from URL or storage
    const ref =
      searchParams.get("ref") || localStorage.getItem(REF_STORAGE_KEY);
    if (ref) {
      setRefToken(ref);
      localStorage.setItem(REF_STORAGE_KEY, ref);
      fetch(`/api/referrals/validate/${ref}`)
        .then((r) => r.json())
        .then((d) => setRefDiscount(d.valid))
        .catch(() => {});
    }

    // Post-checkout fulfillment
    const checkoutSuccess = searchParams.get("checkout_success");
    const storedReportId = localStorage.getItem("pendingReportId");
    if (checkoutSuccess && storedReportId) {
      setFulfillLoading(true);
      fulfillReport(storedReportId, token)
        .then((r) => {
          setPdfUrl(r.pdf_url);
          localStorage.removeItem("pendingReportId");
        })
        .catch(() => {})
        .finally(() => setFulfillLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams, token]);

  // Fetch subscription status on mount
  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) {
      setSubscription(null);
      setSubscriptionLoading(false);
      return;
    }
    setSubscriptionLoading(true);
    getSubscriptionStatus(token)
      .then((res) => {
        setSubscription(res);
        setDaysRemaining(res.days_remaining ?? undefined);
      })
      .catch(() => {
        setSubscription(null);
      })
      .finally(() => setSubscriptionLoading(false));
  }, [authLoading, token, user]);

  const shareUrl = result?.share_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${result.share_token}`
    : typeof window !== "undefined"
      ? window.location.href
      : "";

  const referralUrl = result?.share_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/upload?ref=${result.share_token}`
    : "";

  const copyShare = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    track("share_link_copied", { share_token: result?.share_token });
    setTimeout(() => setCopied(false), 2000);
    // Confetti burst on share
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b"],
    });
  };

  const shareTwitter = () => {
    if (!result) return;
    track("share_twitter_clicked");
    const text = `I just got my Investor DNA Score: ${result.dna_score}/100 🧬\nI'm a "${result.investor_type}"\n\nDiscover yours → `;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + shareUrl)}`,
      "_blank",
    );
  };

  const startOver = () => {
    localStorage.removeItem("dnaResult");
    router.push("/upload");
  };

  const accessState: AccessState = authLoading
    ? "loading"
    : !user
      ? "anonymous"
      : subscriptionLoading
        ? "loading"
        : subscription?.trial_active === true || subscription?.status === "trial"
          ? "trial"
          : subscription?.trial_expired === true || subscription?.status === "expired"
            ? "expired"
            : subscription?.is_active === true || subscription?.status === "active"
              ? "paid"
              : "expired";

  const downloadButtonLabel = pdfUrl
    ? "Download PDF"
    : accessState === "loading"
      ? "Checking access…"
      : accessState === "anonymous"
        ? "Sign up to download"
        : accessState === "expired"
          ? "Upgrade to download"
          : "Download PDF";
  const trialDaysRemaining = daysRemaining ?? subscription?.days_remaining ?? 0;

  const startCheckout = async () => {
    if (accessState === "loading") return;
    if (accessState === "anonymous") {
      router.push("/signup?next=/results");
      return;
    }
    if (accessState === "expired") {
      router.push("/pricing");
      return;
    }
    if (!result?.record_id) {
      document
        .getElementById("unlock-report")
        ?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setCheckoutError(null);
    setCheckoutLoading(true);
    track("advisor_report_unlock_started", {
      record_id: result.record_id,
      access_state: accessState,
    });
    try {
      const report = await fulfillReport(result.record_id, token);
      setPdfUrl(report.pdf_url);
      trackEvent(EVENTS.PDF_DOWNLOADED, {
        source: "results_page_unlock",
      });
      capture("advisor_report_unlocked", {
        report_id: result.record_id,
        access_state: accessState,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Report generation failed. Please try again.";
      track("advisor_report_unlock_error", { error: msg });
      setCheckoutError(msg);
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const typeClass =
    TYPE_COLORS[result.investor_type] || "border-border bg-surface-2 text-navy";

  // Price warnings from backend (stale/alias/unresolvable tickers)
  const priceWarnings: string[] = result.warnings ?? [];
  const failedTickers: string[] = result.failed_tickers ?? [];

  return (
    <>
      <SocialProof />
      {user && (
        <div className="border-b border-border bg-white">
          <div className="page-container max-w-4xl py-4">
            <PortfolioIntelligenceProvider>
              <NextPrimaryAction surface="results" />
            </PortfolioIntelligenceProvider>
          </div>
        </div>
      )}
      <div className="flex min-h-screen flex-col bg-app text-navy">
        {/* Ticker warning banner — non-blocking, shown above results */}
        {(priceWarnings.length > 0 || failedTickers.length > 0) && (
          <div className="bg-yellow-950/60 border-b border-yellow-700/40">
            <div className="max-w-4xl mx-auto px-6 py-3 flex items-start gap-3">
              <span
                className="text-yellow-400 text-lg leading-none mt-0.5"
                aria-hidden
              >
                ⚠
              </span>
              <div className="text-sm text-yellow-200">
                {failedTickers.length > 0 && (
                  <p className="font-medium mb-1">
                    Some tickers were excluded:{" "}
                    {failedTickers.map((t, i) => (
                      <span key={t}>
                        <code className="bg-yellow-900/60 px-1 rounded text-yellow-300">
                          {t}
                        </code>
                        {i < failedTickers.length - 1 ? ", " : ""}
                      </span>
                    ))}{" "}
                    (price unavailable). Analysis is based on your remaining
                    holdings.
                  </p>
                )}
                {priceWarnings
                  .filter(
                    (w) =>
                      !failedTickers.some((t) =>
                        w.startsWith(t + " could not"),
                      ),
                  )
                  .map((w, i) => (
                    <p key={i} className="text-yellow-300/80">
                      {w}
                    </p>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
            <button
              type="button"
              onClick={startOver}
              className="text-sm text-muted2 transition-colors hover:text-primary-dark"
            >
              ← New analysis
            </button>
            <span className="text-xl font-bold text-gradient">Neufin</span>
            <div className="flex items-center gap-3">
              {user ? (
                <Link href="/dashboard" className="btn-primary py-2 text-sm">
                  Dashboard →
                </Link>
              ) : (
                <Link href="/auth" className="btn-outline py-2 text-sm">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </nav>

        {/* Referral banner */}
        {refDiscount && (
          <div className="bg-green-950/60 border-b border-green-800/40">
            <div className="max-w-4xl mx-auto px-6 py-2.5 flex items-center gap-2">
              <span className="text-green-400 text-sm">🎉</span>
              <p className="text-xs text-green-300 font-medium">
                You were referred — get <strong>20% off</strong> your first
                report automatically at checkout
              </p>
            </div>
          </div>
        )}

        {accessState === "trial" && (
          <div className="border-b border-primary/20 bg-primary-light/80">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-2.5">
              <p className="text-xs font-medium text-primary-dark">
                Trial active · {trialDaysRemaining} days remaining
              </p>
              <Link
                href="/pricing"
                className="whitespace-nowrap text-xs font-semibold text-primary-dark hover:text-primary"
              >
                Upgrade to keep access →
              </Link>
            </div>
          </div>
        )}

        {/* Sign-in nudge */}
        {!user && (
          <div className="border-b border-primary/20 bg-primary-light/80">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-2.5">
              <p className="text-xs text-primary-dark">
                Sign in to save your DNA score across devices
              </p>
              <Link
                href="/auth"
                className="whitespace-nowrap text-xs font-semibold text-primary-dark hover:text-primary"
              >
                Sign in to save →
              </Link>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-section">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {/* ── Hero: Score + Type ─────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="card text-center">
              <ScoreCircle score={result.dna_score} />
              <div className="mt-3 mb-1">
                <ScoreLabel score={result.dna_score} />
              </div>
              <div className="mt-2">
                <span
                  className={`badge border ${typeClass} text-sm px-4 py-1.5`}
                >
                  {result.investor_type}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate2">
                Portfolio value:&nbsp;
                <span className="font-semibold text-navy">
                  {formatPortfolioTotalLine({
                    totalValue: result.total_value,
                    multiCurrency: Boolean(result.multi_currency_portfolio),
                    portfolioCurrencies: result.portfolio_currencies,
                  })}
                </span>
                {result.multi_currency_portfolio ? (
                  <span className="block mt-1 text-xs text-amber-400/90">
                    Mixed listing currencies — total is a sum of native amounts, not
                    FX-unified.
                  </span>
                ) : null}
                &nbsp;·&nbsp;
                {result.num_positions} positions &nbsp;·&nbsp; Max
                position:&nbsp;
                <span className="font-semibold text-navy">
                  {pct(result.max_position_pct)}
                </span>
              </p>
            </motion.div>

            {/* ── Overview cards ─────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4">
              <div className="card text-center">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted2">
                  Total Value
                </p>
                <p className="text-2xl font-bold text-navy">
                  {formatPortfolioTotalLine({
                    totalValue: result.total_value,
                    multiCurrency: Boolean(result.multi_currency_portfolio),
                    portfolioCurrencies: result.portfolio_currencies,
                  })}
                </p>
              </div>
              <div className="card text-center">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted2">
                  Positions
                </p>
                <p className="text-2xl font-bold text-navy">
                  {result.num_positions}
                </p>
              </div>
            </motion.div>

            {/* ── AI Analysis ────────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="grid md:grid-cols-2 gap-4">
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-3">
                  💪 Strengths
                </h3>
                <ul className="space-y-2">
                  {result.strengths.map((s, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.08, duration: 0.35 }}
                      className="flex gap-2 text-sm text-slate2"
                    >
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                      {s}
                    </motion.li>
                  ))}
                </ul>
              </div>
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">
                  ⚠️ Watch out
                </h3>
                <ul className="space-y-2">
                  {result.weaknesses.map((w, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.08, duration: 0.35 }}
                      className="flex gap-2 text-sm text-slate2"
                    >
                      <span className="text-red-500 mt-0.5 shrink-0">!</span>
                      {w}
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>

            {/* ── Action plan ────────────────────────────────────────────── */}
            <motion.div
              variants={fadeUp}
              className="card border-primary/25 bg-primary/5"
            >
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
                🎯 Your Neufin Action Plan
              </h3>
              <p className="leading-relaxed text-slate2">
                {result.recommendation}
              </p>
            </motion.div>

            {/* SEA-NATIVE-CURRENCY-FIX: Regional context card (shown when SEA exposure > 10%) */}
            <RegionalContext result={result} />

            {/* SEA-NATIVE-CURRENCY-FIX: Country / region exposure breakdown */}
            {(result.country_exposure?.length ?? 0) > 1 && (
              <CountryExposure result={result} />
            )}

            {/* ── Holdings table ─────────────────────────────────────────── */}
            {result.positions?.length > 0 && (
              <motion.div variants={fadeUp} className="card">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted2">
                    Holdings
                  </h3>
                  {/* SEA-NATIVE-CURRENCY-FIX: show benchmark context when non-US */}
                  {result.portfolio_benchmark && result.portfolio_benchmark !== "^GSPC" && (
                    <span className="text-xs text-muted-foreground">
                      Benchmark:{" "}
                      <BenchmarkLabel benchmark={result.portfolio_benchmark} showTicker />
                    </span>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted2">
                        <th className="text-left pb-2 pr-4">Symbol</th>
                        <th className="text-right pb-2 px-4">Shares</th>
                        <th className="text-right pb-2 px-4">Price</th>
                        <th className="text-right pb-2 px-4">Value</th>
                        <th className="text-left pb-2 pl-4">Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {result.positions.map((p) => (
                        <tr
                          key={p.symbol}
                          className="transition-colors hover:bg-surface-2"
                        >
                          <td className="py-2.5 pr-4 font-mono font-bold text-navy">
                            <div className="flex flex-col gap-0.5">
                              <span>{p.symbol}</span>
                              {p.market_code && (
                                <MarketBadge marketCode={p.market_code} />
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate2">
                            {new Intl.NumberFormat("en-US").format(p.shares)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate2">
                            {isUnresolved(p) ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              formatNativePrice(p.price, p.native_currency)
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-navy">
                            {isUnresolved(p) ? (
                              <QuoteUnavailableBadge symbol={p.symbol} />
                            ) : (
                              <div className="flex flex-col items-end gap-0.5">
                                <span>{formatPositionValuePrimary(p)}</span>
                                {shouldShowFxHint(p) ? (
                                  <span className="text-xs font-normal text-muted2">
                                    {p.fx_indicative_sgd}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 min-w-[64px] flex-1 overflow-hidden rounded-full bg-surface-3">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{
                                    width: `${Math.min(p.weight, 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="w-10 shrink-0 text-right text-xs text-muted2">
                                {pct(p.weight)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {result.positions.map((p) => (
                    <div
                      key={p.symbol}
                      className="flex items-center justify-between border-b border-border py-2 last:border-0"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-mono font-bold text-navy">{p.symbol}</p>
                          {p.market_code && <MarketBadge marketCode={p.market_code} />}
                        </div>
                        <p className="mt-0.5 text-xs text-muted2">
                          {new Intl.NumberFormat("en-US").format(p.shares)}{" "}
                          shares · {isUnresolved(p) ? "—" : formatNativePrice(p.price, p.native_currency)}
                        </p>
                      </div>
                      <div className="text-right">
                        {isUnresolved(p) ? (
                          <QuoteUnavailableBadge symbol={p.symbol} />
                        ) : (
                          <>
                            <p className="font-medium text-navy">
                              {formatPositionValuePrimary(p)}
                            </p>
                            {shouldShowFxHint(p) ? (
                              <p className="text-xs text-muted2 mt-0.5">
                                {p.fx_indicative_sgd}
                              </p>
                            ) : null}
                          </>
                        )}
                        <div className="mt-1 flex items-center justify-end gap-1.5">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(p.weight, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted2">
                            {pct(p.weight)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Allocation Overview ─────────────────────────────────── */}
            {result.positions?.length > 0 && (
              <motion.div variants={fadeUp} className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted2">
                    Allocation Overview
                  </h3>
                  {result.max_position_pct > 40 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2.5 py-1">
                      ⚠ High concentration
                    </span>
                  )}
                </div>
                <PortfolioPie positions={result.positions} />
              </motion.div>
            )}

            {/* ── Actions ────────────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="grid sm:grid-cols-3 gap-3">
              {/* Share My DNA */}
              <a
                href={result.share_url || shareUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  track("share_dna_opened", { share_token: result.share_token })
                }
                className="btn-primary flex items-center justify-center gap-2 py-3 text-sm"
              >
                🧬 Share My DNA
              </a>

              {/* PDF download follows auth/trial/subscription access state */}
              <button
                onClick={
                  pdfUrl ? () => window.open(pdfUrl, "_blank") : startCheckout
                }
                disabled={checkoutLoading || accessState === "loading"}
                className={`btn-primary flex items-center justify-center gap-2 py-3 text-sm
                  ${checkoutLoading || accessState === "loading" ? "opacity-70 cursor-wait" : ""}`}
              >
                {checkoutLoading ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  downloadButtonLabel
                )}
              </button>

              {/* Start Over */}
              <button
                onClick={startOver}
                className="flex items-center justify-center gap-2 rounded-lg border border-border py-3 text-sm text-muted2 transition-colors hover:border-primary hover:text-primary-dark"
              >
                ↩ Start Over
              </button>
            </motion.div>

            {/* ── Share panel ─────────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="card">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted2">
                Share your result
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={copyShare}
                  className="btn-outline text-xs py-2.5 flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1"
                >
                  {copied ? "✓ Copied!" : "🔗 Copy link"}
                </button>
                <button
                  onClick={shareTwitter}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
                >
                  𝕏 Twitter/X
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`I got ${result.dna_score}/100 on my Investor DNA Score 🧬 I'm a "${result.investor_type}" — see yours free → ${shareUrl}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track("share_whatsapp_clicked")}
                  className="bg-[#25D366]/80 hover:bg-[#25D366] text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  WhatsApp
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`My Investor DNA Score: ${result.dna_score}/100 — I'm a "${result.investor_type}"`)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track("share_telegram_clicked")}
                  className="bg-[#2AABEE]/80 hover:bg-[#2AABEE] text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  Telegram
                </a>
              </div>
            </motion.div>

            {/* ── Referral link ───────────────────────────────────────────── */}
            {referralUrl && (
              <motion.div
                variants={fadeUp}
                className="card border border-primary/20 bg-primary-light/50"
              >
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-primary-dark">
                  🎁 Your referral link
                </h3>
                <p className="mb-3 text-xs text-muted2">
                  Share this link — friends get 20% off their first report, and
                  you build your Neufin reputation.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={referralUrl}
                    className="input-base flex-1 rounded-lg px-3 py-2 font-mono text-xs"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(referralUrl);
                      track("referral_link_copied");
                    }}
                    className="btn-primary text-xs py-2 px-4 shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </motion.div>
            )}

            {/* Swarm Brain — 7-agent visualization (all complete after analysis) */}
            <SwarmBrainPanel
              agentStates={{
                market_regime: "complete",
                strategist: "complete",
                quant: "complete",
                tax_architect: "complete",
                risk_sentinel: "complete",
                alpha_scout: "complete",
                synthesizer: "complete",
              }}
            />

            {/* Competitor benchmarking — NeuFin vs Market */}
            <BenchmarkChart />

            {/* ── Unlock report ───────────────────────────────────────────── */}
            <motion.div variants={fadeUp} id="unlock-report">
              {/* PDF ready — download banner */}
              {accessState === "loading" ? (
                <div className="card border border-primary/20 bg-white">
                  <div className="animate-pulse space-y-3">
                    <div className="h-5 w-48 rounded bg-surface-3" />
                    <div className="h-3 w-full rounded bg-surface-3" />
                    <div className="h-3 w-5/6 rounded bg-surface-3" />
                    <div className="h-11 w-full rounded bg-surface-3" />
                  </div>
                </div>
              ) : pdfUrl ? (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    trackEvent(EVENTS.PDF_DOWNLOADED, {
                      source: "results_page",
                    });
                    capture("advisor_report_downloaded", {
                      report_id: result?.record_id,
                    });
                  }}
                  className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-base"
                >
                  ⬇ Download Your Advisor Report (PDF)
                </a>
              ) : accessState === "anonymous" ? (
                <div className="card border border-primary/25 bg-white">
                  <div className="mb-5">
                    <h2 className="text-lg font-bold text-navy">
                      Create your free account to unlock the full report
                    </h2>
                    <p className="mt-1 text-sm text-muted2">
                      14-day full access · No credit card required · Instant
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link
                      href="/signup?next=/results"
                      className="btn-primary flex-1 py-3 text-center text-sm"
                    >
                      Sign up free →
                    </Link>
                    <Link
                      href="/login?next=/results"
                      className="btn-outline flex-1 py-3 text-center text-sm"
                    >
                      Already have an account? Sign in
                    </Link>
                  </div>
                </div>
              ) : accessState === "expired" ? (
                <div className="card border border-amber-400/30 bg-white">
                  <div className="mb-5">
                    <h2 className="text-lg font-bold text-navy">
                      Your 14-day trial has ended
                    </h2>
                    <p className="mt-1 text-sm text-muted2">
                      Upgrade to continue accessing full reports and PDF exports.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Link
                      href="/pricing"
                      className="rounded-lg border border-primary/30 p-4 transition-colors hover:border-primary hover:bg-primary-light/60"
                    >
                      <p className="text-sm font-bold text-navy">
                        Advisor $299/month
                      </p>
                      <p className="mt-1 text-xs text-muted2">
                        Full reports, PDF exports, advisor workflows
                      </p>
                    </Link>
                    <Link
                      href="/contact-sales"
                      className="rounded-lg border border-primary/30 p-4 transition-colors hover:border-primary hover:bg-primary-light/60"
                    >
                      <p className="text-sm font-bold text-navy">
                        Enterprise $999/month
                      </p>
                      <p className="mt-1 text-xs text-muted2">
                        Team access, white-label support, priority onboarding
                      </p>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="card border border-primary/25 bg-white">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-navy">
                        Full report access included
                      </h2>
                      <p className="mt-0.5 text-xs text-muted2">
                        Generate your advisor-ready PDF with your current access.
                      </p>
                    </div>
                    <span className="text-2xl shrink-0">📄</span>
                  </div>

                  {/* What's inside */}
                  <ul className="space-y-2 mb-5">
                    {[
                      {
                        icon: "📊",
                        label: "Detailed Sector Exposure",
                        sub: "Breakdown by industry, geography & asset class",
                      },
                      {
                        icon: "📉",
                        label: "Annualized Volatility & Risk Metrics",
                        sub: `Sharpe ratio, max drawdown, beta vs ${BENCHMARK_LABELS[result.portfolio_benchmark ?? "^GSPC"] ?? "S&P 500"}`,
                      },
                      {
                        icon: "🎯",
                        label: "Actionable Buy / Sell Signals",
                        sub: "AI-ranked rebalancing moves with rationale",
                      },
                      {
                        icon: "🏦",
                        label: "Advisor-Ready White-label Formatting",
                        sub: "Clean PDF you can share with your financial advisor",
                      },
                    ].map(({ icon, label, sub }) => (
                      <li key={label} className="flex items-start gap-3">
                        <span className="text-base shrink-0 mt-0.5">
                          {icon}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-navy">
                            {label}
                          </p>
                          <p className="text-xs text-muted2">{sub}</p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {fulfillLoading ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-primary py-3">
                      <span className="inline-block w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Generating your report…
                    </div>
                  ) : (
                    <button
                      onClick={startCheckout}
                      disabled={checkoutLoading}
                      className={`w-full btn-primary py-3.5 text-base flex items-center justify-center gap-2
                        ${checkoutLoading ? "opacity-70 cursor-wait" : ""}`}
                    >
                      {checkoutLoading ? (
                        <>
                          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Generating your report…
                        </>
                      ) : (
                        "Generate Full Report PDF"
                      )}
                    </button>
                  )}

                  {checkoutError && (
                    <p className="mt-3 text-xs text-red-400 text-center">
                      ⚠ {checkoutError}
                    </p>
                  )}

                  {/* Free unlock via referrals */}
                  <div className="mt-3 border-t border-border pt-3 text-center">
                    <Link
                      href="/referrals"
                      className="text-xs text-primary-dark transition-colors hover:text-primary"
                    >
                      🎁 Or get it free by inviting 3 friends →
                    </Link>
                  </div>
                </div>
              )}
            </motion.div>

            {/* ── Advisor CTA ─────────────────────────────────────────────── */}
            {refToken && (
              <motion.div variants={fadeUp}>
                <AdvisorCTA refToken={refToken} />
              </motion.div>
            )}

            {/* ── Swarm IC upgrade CTA ────────────────────────────────────── */}
            <motion.div variants={fadeUp}>
              <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-surface-2 p-5 text-center space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
                  Upgrade to Swarm IC
                </p>
                <p className="text-base font-bold text-navy">
                  Your DNA score is ready. Now get the full Investment Committee
                  briefing.
                </p>
                <p className="text-sm text-muted2">
                  7 AI agents cross-examine your portfolio with macro regime
                  context, exact trade sizing, and tax-lot optimisation.
                </p>
                <Link
                  href="/dashboard/swarm"
                  className="inline-block rounded-xl bg-amber-500 px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-600"
                >
                  Run 7-Agent Swarm Analysis →
                </Link>
              </div>
            </motion.div>

            {/* ── Dashboard CTA ───────────────────────────────────────────── */}
            <motion.div variants={fadeUp} className="text-center pb-6">
              <Link
                href="/dashboard"
                className="btn-primary inline-block px-10 py-3"
              >
                Open Full Dashboard →
              </Link>
            </motion.div>
          </motion.div>
        </main>
      </div>
    </>
  );
}
