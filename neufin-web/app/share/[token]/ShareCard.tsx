"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import CopyButton from "./CopyButton";
import AdvisorCTA from "@/components/AdvisorCTA";
import {
  parseStringListField,
  unwrapAccidentalJsonObjectString,
} from "@/lib/display-text";
import { FINANCIAL_EM_DASH } from "@/lib/finance-content";

interface DNAShare {
  id: string;
  dna_score: number;
  investor_type: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  share_token: string;
  view_count: number;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { emoji: string; color: string }> = {
  "Diversified Strategist": { emoji: "⚖️", color: "#3b82f6" },
  "Conviction Growth": { emoji: "🚀", color: "#8b5cf6" },
  "Momentum Trader": { emoji: "⚡", color: "#f59e0b" },
  "Defensive Allocator": { emoji: "🛡️", color: "#22c55e" },
  "Speculative Investor": { emoji: "🎯", color: "#ef4444" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

function ScoreArc({ score }: { score: number }) {
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  const r = 52;
  const circ = 2 * Math.PI * r;
  const fill = circ - (score / 100) * circ;

  return (
    <svg width="140" height="140" className="-rotate-90" aria-hidden>
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="#1f2937"
        strokeWidth="10"
      />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={fill}
        style={{
          transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </svg>
  );
}

function normalizeBulletLines(lines: string[]): string[] {
  return lines.flatMap((line) => {
    const t = (line ?? "").trim();
    if (!t) return [];
    if (t.startsWith("[")) return parseStringListField(t);
    return [unwrapAccidentalJsonObjectString(t)];
  });
}

export default function ShareCard({ data }: { data: DNAShare }) {
  const strengths = normalizeBulletLines(data.strengths ?? []);
  const weaknesses = normalizeBulletLines(data.weaknesses ?? []);
  const recommendation = unwrapAccidentalJsonObjectString(
    data.recommendation ?? "",
  );

  const cfg = TYPE_CONFIG[data.investor_type] ?? {
    emoji: "🧬",
    color: "#3b82f6",
  };
  const scoreColor =
    data.dna_score >= 70
      ? "#22c55e"
      : data.dna_score >= 40
        ? "#f59e0b"
        : "#ef4444";
  const shareUrl = `${window.location.origin}/share/${data.share_token}`;
  const referralUrl = `${window.location.origin}/upload?ref=${data.share_token}`;
  const twitterText = `I just got my Investor DNA Score: ${data.dna_score}/100 🧬\nI'm a "${data.investor_type}"\n\nWhat kind of investor are you? → ${shareUrl}`;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="w-full flex flex-col items-center gap-4"
    >
      {/* ── Trophy card ───────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="w-full rounded-2xl border border-shell-border overflow-hidden"
        style={{
          background: `radial-gradient(ellipse at top left, ${cfg.color}18 0%, transparent 60%), #0d1117`,
        }}
      >
        {/* Header */}
        <div className="px-8 pt-6 pb-4 flex items-center justify-between border-b border-shell-border/60">
          <span className="text-sm font-bold text-gradient tracking-wide">
            Neufin Investor DNA
          </span>
          <span className="text-xs text-shell-subtle">
            {new Date(data.created_at).toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>

        {/* Score + type */}
        <div className="px-8 py-6 flex flex-col sm:flex-row items-center gap-8">
          <div className="relative shrink-0">
            <ScoreArc score={data.dna_score} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-3xl font-extrabold"
                style={{ color: scoreColor }}
              >
                {data.dna_score}
              </span>
              <span className="text-xs text-shell-subtle uppercase tracking-wider">
                /100
              </span>
            </div>
          </div>
          <div className="text-center sm:text-left">
            <div className="text-3xl mb-2">{cfg.emoji}</div>
            <h1 className="text-2xl font-bold text-white leading-tight">
              {data.investor_type}
            </h1>
            <p className="text-sm text-shell-subtle mt-1">
              {(data.view_count ?? 0).toLocaleString()} investors have viewed
              this
            </p>
          </div>
        </div>

        {/* Strengths + weaknesses */}
        <div className="px-8 pb-6 grid sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-3">
              💪 Strengths
            </h3>
            <ul className="space-y-2">
              {strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-shell-fg/90">
                  <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-3">
              ⚠️ Watch out
            </h3>
            <ul className="space-y-2">
              {weaknesses.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-shell-fg/90">
                  <span className="text-amber-500 shrink-0 mt-0.5">!</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recommendation */}
        <div
          className="mx-8 mb-8 rounded-xl p-4 border"
          style={{
            background: `${cfg.color}10`,
            borderColor: `${cfg.color}30`,
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-1.5"
            style={{ color: cfg.color }}
          >
            🎯 AI Recommendation
          </p>
          <p className="text-sm text-shell-fg/90 leading-relaxed">
            {recommendation || FINANCIAL_EM_DASH}
          </p>
        </div>

        {/* Card footer */}
        <div className="px-8 py-4 border-t border-shell-border/60 flex items-center justify-between">
          <span className="text-xs text-shell-subtle">neufin.app</span>
          <span className="text-xs text-shell-subtle font-mono">
            {data.share_token}
          </span>
        </div>
      </motion.div>

      {/* ── Share actions ──────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2"
      >
        <CopyButton url={shareUrl} />
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}`}
          target="_blank"
          rel="noreferrer"
          className="bg-sky-600/80 hover:bg-sky-500/80 text-white text-xs font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          𝕏 Twitter/X
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `Check out my Investor DNA Score: ${data.dna_score}/100 🧬 I'm a "${data.investor_type}".\n\nFind out yours free → ${shareUrl}`,
          )}`}
          target="_blank"
          rel="noreferrer"
          className="bg-[#25D366]/80 hover:bg-[#25D366] text-white text-xs font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          WhatsApp
        </a>
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(
            `My Investor DNA: ${data.dna_score}/100 — I'm a "${data.investor_type}" 🧬`,
          )}`}
          target="_blank"
          rel="noreferrer"
          className="bg-[#2AABEE]/80 hover:bg-[#2AABEE] text-white text-xs font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          Telegram
        </a>
      </motion.div>

      {/* ── Referral ───────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="w-full card border-purple-800/30 bg-purple-950/20"
      >
        <p className="text-sm font-semibold text-purple-300 mb-1">
          🎁 Refer a friend — they get 20% off
        </p>
        <p className="text-xs text-shell-subtle mb-3">
          Share your link. Anyone who buys an Advisor Report through it gets 20%
          off automatically.
        </p>
        <div className="flex gap-2">
          <code className="flex-1 bg-shell border border-shell-border rounded-lg px-3 py-2 text-xs text-shell-fg/90 truncate font-mono">
            {referralUrl}
          </code>
          <CopyButton url={referralUrl} />
        </div>
      </motion.div>

      {/* ── Primary CTA ────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="card w-full border-primary/20 bg-gradient-to-br from-primary-light/80 to-surface-2 text-center"
      >
        <p className="mb-1 font-semibold text-navy">
          What&apos;s your Investor DNA?
        </p>
        <p className="mb-4 text-sm text-muted2">
          Upload your portfolio CSV — your analysis is ready in under 10
          seconds.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/upload" className="btn-primary inline-block">
            Analyze My Portfolio →
          </Link>
          <Link
            href="/leaderboard"
            className="btn-outline inline-block text-sm"
          >
            🏆 View Leaderboard
          </Link>
        </div>
      </motion.div>

      {/* ── Advisor CTA (shown when share token belongs to an advisor) ── */}
      <motion.div variants={fadeUp} className="w-full">
        <AdvisorCTA refToken={data.share_token} />
      </motion.div>

      {/* ── Value prop ─────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="w-full pb-6">
        <div className="border-t border-shell-border/60 pt-6 grid sm:grid-cols-3 gap-4 text-center">
          {[
            {
              icon: "🧬",
              title: "AI-Powered DNA",
              body: "Scans your portfolio for hidden risks and diversification gaps.",
            },
            {
              icon: "⚡",
              title: "Instant Analysis",
              body: "Upload a CSV — your full DNA report is ready in seconds.",
            },
            {
              icon: "🔒",
              title: "Private by Default",
              body: "Your position details are never made public. Only insights are shared.",
            },
          ].map(({ icon, title, body }) => (
            <div key={title} className="space-y-1">
              <div className="text-2xl">{icon}</div>
              <p className="text-sm font-semibold text-shell-fg/90">{title}</p>
              <p className="text-xs text-shell-subtle">{body}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
