"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface LeaderboardEntry {
  dna_score: number;
  investor_type: string;
  share_token: string;
  created_at: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "";

const TYPE_EMOJI: Record<string, string> = {
  "Diversified Strategist": "⚖️",
  "Conviction Growth": "🚀",
  "Momentum Trader": "⚡",
  "Defensive Allocator": "🛡️",
  "Speculative Investor": "🎯",
};

function scoreLabel(score: number): string {
  if (score >= 80) return "exceptional";
  if (score >= 70) return "strong";
  if (score >= 50) return "solid";
  return "interesting";
}

function buildMessage(entry: LeaderboardEntry): string {
  const emoji = TYPE_EMOJI[entry.investor_type] ?? "🧬";
  return `${emoji} A ${entry.investor_type} just scored ${entry.dna_score}/100 — ${scoreLabel(entry.dna_score)} DNA!`;
}

// Show for 5s, then hide for 12s before showing the next one
const SHOW_MS = 5_000;
const GAP_MS = 12_000;

export default function SocialProof() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const idxRef = useRef(0);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch leaderboard once ──────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/dna/leaderboard?limit=10`)
      .then((r) => r.json())
      .then((d) => {
        const list: LeaderboardEntry[] = d.leaderboard ?? [];
        if (list.length > 0) setEntries(list);
      })
      .catch(() => {});
  }, []);

  // ── Start cycling once we have data ────────────────────────────────────────
  useEffect(() => {
    if (entries.length === 0) return;

    function showNext() {
      const entry = entries[idxRef.current % entries.length];
      idxRef.current += 1;
      setMessage(buildMessage(entry));
      setVisible(true);

      showTimer.current = setTimeout(() => {
        setVisible(false);
        hideTimer.current = setTimeout(showNext, GAP_MS);
      }, SHOW_MS);
    }

    // Initial delay so it doesn't pop up immediately on page load
    hideTimer.current = setTimeout(showNext, 4_000);

    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-5 z-50 pointer-events-none">
      <AnimatePresence>
        {visible && message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, x: -20, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -16, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="
              pointer-events-auto
              max-w-xs bg-shell/95 backdrop-blur-sm
              border border-shell-border/60 rounded-xl
              px-4 py-3 shadow-2xl
              flex items-start gap-3
            "
          >
            {/* Pulse dot */}
            <span className="relative flex h-2 w-2 shrink-0 mt-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>

            <p className="text-xs text-shell-fg/90 leading-relaxed">
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
