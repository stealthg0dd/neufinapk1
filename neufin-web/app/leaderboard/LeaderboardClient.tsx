'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Dna, Trophy } from 'lucide-react'

export interface LeaderboardEntry {
  dna_score: number
  investor_type: string
  share_token: string
  created_at: string
}

const TYPE_CONFIG: Record<string, { mono: string; color: string }> = {
  'Diversified Strategist': { mono: 'DS', color: '#3b82f6' },
  'Conviction Growth': { mono: 'CG', color: '#8b5cf6' },
  'Momentum Trader': { mono: 'MT', color: '#f59e0b' },
  'Defensive Allocator': { mono: 'DA', color: '#16a34a' },
  'Speculative Investor': { mono: 'SI', color: '#dc2626' },
}

const PODIUM_CONFIG = [
  { rank: 2, label: '2nd', medal: 'Silver', barH: 'h-20', order: 'order-1', offsetY: 'mt-8' },
  { rank: 1, label: '1st', medal: 'Gold', barH: 'h-32', order: 'order-2', offsetY: 'mt-0' },
  { rank: 3, label: '3rd', medal: 'Bronze', barH: 'h-14', order: 'order-3', offsetY: 'mt-12' },
] as const

const PODIUM_COLORS = {
  Gold:   { border: 'border-yellow-500/50',  bg: 'bg-yellow-500/10', glow: '#eab308' },
  Silver: { border: 'border-shell-muted/40',    bg: 'bg-shell-muted/5',    glow: '#9ca3af' },
  Bronze: { border: 'border-orange-600/40',  bg: 'bg-orange-600/5',  glow: '#c2410c' },
} as const

function scoreColor(score: number) {
  return score >= 70 ? '#16A34A' : score >= 40 ? '#f59e0b' : '#DC2626'
}

const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const rowVariant = {
  hidden:  { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0 },
}

// ── Podium card ────────────────────────────────────────────────────────────────
function PodiumCard({
  entry,
  config,
  isMe,
}: {
  entry: LeaderboardEntry
  config: typeof PODIUM_CONFIG[number]
  isMe: boolean
}) {
  const cfg = TYPE_CONFIG[entry.investor_type] ?? { mono: 'NA', color: '#6b7280' }
  const pCfg = PODIUM_COLORS[config.medal]
  const sc = scoreColor(entry.dna_score)

  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.5, delay: (3 - config.rank) * 0.1 }}
      className={`flex flex-col items-center gap-2 ${config.offsetY} ${config.order}`}
    >
      {/* Card */}
      <Link
        href={`/share/${entry.share_token}`}
        className={`w-full rounded-xl border p-4 text-center transition-all hover:scale-105 relative overflow-hidden
          ${pCfg.border} ${pCfg.bg}
          ${isMe ? 'ring-2 ring-blue-500/60' : ''}`}
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
      >
        {isMe && (
          <span className="absolute top-1.5 right-1.5 text-sm font-bold text-blue-400 bg-blue-500/20 border border-blue-500/40 rounded-full px-1.5 py-0.5 leading-none">
            YOU
          </span>
        )}
        <span className="agent-badge mx-auto mb-1">{cfg.mono}</span>
        <div className="text-xl font-extrabold" style={{ color: sc }}>
          {entry.dna_score}
        </div>
        <div className="text-sm text-shell-subtle leading-none mb-1">/100</div>
        <div className="text-xs font-medium truncate" style={{ color: cfg.color }}>
          {entry.investor_type}
        </div>
      </Link>

      {/* Podium bar */}
      <div
        className={`w-full ${config.barH} rounded-t-lg flex items-center justify-center`}
        style={{ background: `${pCfg.glow}22`, borderTop: `2px solid ${pCfg.glow}44` }}
      >
        <span className="text-xs font-bold uppercase tracking-wider text-shell-fg">{config.label}</span>
      </div>
    </motion.div>
  )
}

// ── Main client component ──────────────────────────────────────────────────────
export default function LeaderboardClient({ entries }: { entries: LeaderboardEntry[] }) {
  const [myToken, setMyToken] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('dnaResult')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.share_token) setMyToken(parsed.share_token)
      }
    } catch {
      // localStorage unavailable or malformed
    }
  }, [])

  const top3 = entries.slice(0, 3)
  const rest = entries.slice(3)
  const myRank = myToken ? entries.findIndex((e) => e.share_token === myToken) + 1 : 0

  if (entries.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card text-center py-section"
      >
        <Trophy className="mx-auto mb-4 h-14 w-14 text-amber-500/80" aria-hidden />
        <p className="text-shell-fg/90 font-semibold mb-1">The leaderboard is empty</p>
        <p className="text-shell-subtle text-sm mb-6">Be the first investor to claim the top spot.</p>
        <Link href="/upload" className="btn-primary inline-block">
          Analyze My Portfolio →
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
      className="space-y-6"
    >
      {/* ── Your rank banner ──────────────────────────────────────── */}
      {myRank > 0 && (
        <motion.div
          variants={fadeUp}
          className="card border-blue-800/40 bg-blue-950/20 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <Dna className="h-8 w-8 shrink-0 text-blue-400" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-blue-300">Your current rank</p>
              <p className="text-xs text-shell-subtle">Based on your last analysis</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-2xl font-extrabold text-white">#{myRank}</span>
            <p className="text-xs text-shell-subtle">of {entries.length}</p>
          </div>
        </motion.div>
      )}

      {/* ── Podium (top 3) ────────────────────────────────────────── */}
      {top3.length >= 1 && (
        <motion.div variants={fadeUp} className="w-full">
          <div className="flex items-end gap-3 justify-center">
            {PODIUM_CONFIG.filter((c) => c.rank <= top3.length).map((config) => {
              const entry = top3[config.rank - 1]
              return (
                <div key={config.rank} className={`flex-1 max-w-[140px] ${config.order}`}>
                  <PodiumCard
                    entry={entry}
                    config={config}
                    isMe={entry.share_token === myToken}
                  />
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ── Rankings (4+) ─────────────────────────────────────────── */}
      {rest.length > 0 && (
        <motion.div variants={fadeUp} className="card overflow-hidden p-0">
          <div className="px-5 py-3 border-b border-shell-border/60">
            <h2 className="text-xs font-semibold text-shell-subtle uppercase tracking-wide">
              Rankings
            </h2>
          </div>
          <ul className="divide-y divide-shell-border/50">
            {rest.map((entry, i) => {
              const rank   = i + 4
              const cfg = TYPE_CONFIG[entry.investor_type] ?? { mono: 'NA', color: '#6b7280' }
              const sc     = scoreColor(entry.dna_score)
              const isMe   = entry.share_token === myToken

              return (
                <motion.li
                  key={entry.share_token}
                  variants={rowVariant}
                  transition={{ duration: 0.3 }}
                >
                  <Link
                    href={`/share/${entry.share_token}`}
                    className={`flex items-center gap-4 px-5 py-3.5 hover:bg-shell-raised/30 transition-colors group relative
                      ${isMe ? 'bg-blue-950/20 border-l-2 border-l-blue-500' : ''}`}
                  >
                    {/* Rank */}
                    <span className="w-8 text-center text-sm font-bold text-shell-subtle shrink-0">
                      #{rank}
                    </span>

                    {/* Type */}
                    <span className="agent-badge shrink-0 text-sm">{cfg.mono}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: cfg.color }}>
                        {entry.investor_type}
                      </p>
                      <p className="text-xs text-shell-subtle hidden sm:block">
                        {new Date(entry.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>

                    {/* "You" badge */}
                    {isMe && (
                      <span className="text-sm font-bold text-blue-400 bg-blue-500/20 border border-blue-500/40 rounded-full px-2 py-0.5 shrink-0">
                        You
                      </span>
                    )}

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <span className="text-xl font-extrabold" style={{ color: sc }}>
                        {entry.dna_score}
                      </span>
                      <span className="text-xs text-shell-subtle">/100</span>
                    </div>

                    <span className="text-shell-subtle group-hover:text-shell-muted transition-colors text-sm shrink-0">
                      →
                    </span>
                  </Link>
                </motion.li>
              )
            })}
          </ul>
        </motion.div>
      )}

      {/* ── Bottom CTA ────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="card text-center border-blue-800/30 bg-gradient-to-br from-blue-950/40 to-purple-950/30 pb-6"
      >
        <p className="text-shell-fg font-semibold mb-1">Think you can beat the top score?</p>
        <p className="text-shell-subtle text-sm mb-4">
          Upload your portfolio CSV and get your Investor DNA Score in seconds.
        </p>
        <Link href="/upload" className="btn-primary inline-block px-10 py-3">
          Analyze My Portfolio →
        </Link>
      </motion.div>
    </motion.div>
  )
}
