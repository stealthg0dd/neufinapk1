'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { useNeufinAnalytics } from '@/lib/analytics'

// ── Milestone config ──────────────────────────────────────────────────────────
const MILESTONES = [
  { count: 1, icon: '🎟️', reward: '20% off your next report',      color: 'blue'   },
  { count: 3, icon: '📄', reward: '1 free Pro Report ($29 value)',  color: 'purple' },
  { count: 5, icon: '⭐', reward: 'Lifetime Pro Access',            color: 'amber'  },
] as const

const MILESTONE_COLORS = {
  blue:   { ring: 'ring-blue-500/50',   bg: 'bg-blue-500/10',   text: 'text-blue-300',   bar: 'bg-blue-500'   },
  purple: { ring: 'ring-purple-500/50', bg: 'bg-purple-500/10', text: 'text-purple-300', bar: 'bg-purple-500' },
  amber:  { ring: 'ring-amber-500/50',  bg: 'bg-amber-500/10',  text: 'text-amber-300',  bar: 'bg-amber-500'  },
}

const SHARE_COUNT_KEY = 'neufin_share_count'
const MAX_MILESTONE   = MILESTONES[MILESTONES.length - 1].count

const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReferralsPage() {
  const { user } = useAuth()
  const { capture } = useNeufinAnalytics()

  const [shareToken,  setShareToken]  = useState<string | null>(null)
  const [shareCount,  setShareCount]  = useState(0)
  const [copied,      setCopied]      = useState(false)
  const [shareSupported, setShareSupported] = useState(false)
  const [origin,      setOrigin]      = useState('https://neufin.app')

  useEffect(() => {
    setOrigin(window.location.origin)
    setShareSupported(typeof navigator !== 'undefined' && !!navigator.share)

    // Derive referral token from the user's latest DNA result
    try {
      const stored = localStorage.getItem('dnaResult')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.share_token) setShareToken(parsed.share_token)
      }
    } catch { /* ignore */ }

    // Load persisted share count
    const saved = parseInt(localStorage.getItem(SHARE_COUNT_KEY) ?? '0', 10)
    setShareCount(isNaN(saved) ? 0 : saved)
  }, [])

  const referralUrl = shareToken ? `${origin}/upload?ref=${shareToken}` : null

  // ── Derived milestone ───────────────────────────────────────────────────────
  const activeMilestone = [...MILESTONES].reverse().find((m) => shareCount >= m.count) ?? null
  const nextMilestone   = MILESTONES.find((m) => shareCount < m.count) ?? null
  const progressPct     = Math.min(100, Math.round((shareCount / MAX_MILESTONE) * 100))

  // ── Actions ─────────────────────────────────────────────────────────────────
  const recordShare = () => {
    const next = shareCount + 1
    setShareCount(next)
    localStorage.setItem(SHARE_COUNT_KEY, String(next))
  }

  const copyLink = async () => {
    if (!referralUrl) return
    await navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    capture('referral_link_shared', { channel: 'copy' })
    recordShare()
    setTimeout(() => setCopied(false), 2500)
  }

  const nativeShare = async () => {
    if (!referralUrl) return
    try {
      await navigator.share({
        title: 'Discover your Investor DNA',
        text:  `I scored ${localStorage.getItem('dnaResult') ? JSON.parse(localStorage.getItem('dnaResult')!).dna_score : '?'}/100 on my Investor DNA Score 🧬 — check yours free:`,
        url:   referralUrl,
      })
      capture('referral_link_shared', { channel: 'copy' })
      recordShare()
    } catch {
      // user cancelled — no-op
    }
  }

  const shareTwitter = () => {
    if (!referralUrl) return
    const score = (() => { try { return JSON.parse(localStorage.getItem('dnaResult')!).dna_score } catch { return '?' } })()
    const text  = `I scored ${score}/100 on my Investor DNA Score 🧬\nDiscover yours (and get 20% off your first report) → `
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text + referralUrl)}`, '_blank')
    capture('referral_link_shared', { channel: 'twitter' })
    recordShare()
  }

  const shareWhatsApp = () => {
    if (!referralUrl) return
    window.open(`https://wa.me/?text=${encodeURIComponent(`Check out my Investor DNA Score 🧬 — use my link and get 20% off your first report: ${referralUrl}`)}`, '_blank')
    capture('referral_link_shared', { channel: 'whatsapp' })
    recordShare()
  }

  // ── No DNA result yet ───────────────────────────────────────────────────────
  if (shareToken === null && typeof window !== 'undefined' && !localStorage.getItem('dnaResult')) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          </div>
        </nav>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-4xl">🧬</p>
          <h1 className="text-xl font-bold text-white">Run your DNA analysis first</h1>
          <p className="text-gray-500 text-sm max-w-xs">
            Your unique referral link is generated after your first portfolio scan.
          </p>
          <Link href="/upload" className="btn-primary mt-2">Analyze My Portfolio →</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/results" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Results
          </Link>
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          {user ? (
            <Link href="/dashboard" className="btn-primary py-2 text-sm">Dashboard →</Link>
          ) : (
            <Link href="/auth" className="btn-outline py-2 text-sm">Sign in</Link>
          )}
        </div>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {/* ── Header ────────────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="text-center space-y-2 mb-6">
            <h1 className="text-3xl font-bold text-white">🎁 Your Referral Hub</h1>
            <p className="text-gray-400 text-sm">
              Share your link. Friends get 20% off. You unlock rewards.
            </p>
          </motion.div>

          {/* ── Referral link card ────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Your Referral Link
            </h2>

            {referralUrl ? (
              <>
                <div className="flex gap-2 mb-4">
                  <input
                    readOnly
                    value={referralUrl}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-xs text-gray-300 font-mono truncate"
                  />
                  <button
                    onClick={copyLink}
                    className="btn-primary text-xs py-2 px-4 shrink-0 flex items-center gap-1.5"
                  >
                    {copied ? '✓ Copied!' : '🔗 Copy'}
                  </button>
                </div>

                {/* Share buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {shareSupported && (
                    <button
                      onClick={nativeShare}
                      className="btn-outline text-xs py-2.5 flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1"
                    >
                      📤 Share via…
                    </button>
                  )}
                  <button
                    onClick={shareTwitter}
                    className="bg-sky-600/80 hover:bg-sky-500/80 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    𝕏 Twitter/X
                  </button>
                  <button
                    onClick={shareWhatsApp}
                    className="bg-[#25D366]/80 hover:bg-[#25D366] text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center"
                  >
                    WhatsApp
                  </button>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent('Check out my Investor DNA Score 🧬 — use my link and get 20% off:')}`}
                    target="_blank" rel="noreferrer"
                    onClick={recordShare}
                    className="bg-[#2AABEE]/80 hover:bg-[#2AABEE] text-white text-xs font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center"
                  >
                    Telegram
                  </a>
                </div>

                <p className="text-xs text-gray-600 mt-3 text-center">
                  Anyone who uses your link gets 20% off their first report automatically
                </p>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
              </div>
            )}
          </motion.div>

          {/* ── Progress toward rewards ───────────────────────────────── */}
          <motion.div variants={fadeUp} className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Your Progress
              </h2>
              <span className="text-xs text-gray-500">{shareCount} / {MAX_MILESTONE} shares</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden mb-4">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-amber-500 rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
              />
            </div>

            {/* Milestone rows */}
            <div className="space-y-3">
              {MILESTONES.map((m) => {
                const unlocked = shareCount >= m.count
                const colors   = MILESTONE_COLORS[m.color]
                return (
                  <div
                    key={m.count}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all
                      ${unlocked ? `${colors.bg} ${colors.ring} ring-1` : 'border-gray-800'}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0
                        ${unlocked ? colors.bg : 'bg-gray-800'}`}
                    >
                      {unlocked ? '✓' : m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${unlocked ? colors.text : 'text-gray-400'}`}>
                        {m.reward}
                      </p>
                      <p className="text-xs text-gray-600">
                        {unlocked ? 'Unlocked!' : `Share with ${m.count} friend${m.count > 1 ? 's' : ''}`}
                      </p>
                    </div>
                    {unlocked && (
                      <AnimatePresence>
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className={`text-xs font-bold px-2.5 py-1 rounded-full ${colors.bg} ${colors.text}`}
                        >
                          Unlocked
                        </motion.span>
                      </AnimatePresence>
                    )}
                  </div>
                )
              })}
            </div>

            {nextMilestone && (
              <p className="text-center text-xs text-gray-600 mt-4">
                {nextMilestone.count - shareCount} more share{nextMilestone.count - shareCount > 1 ? 's' : ''} to unlock:&nbsp;
                <span className="text-gray-400 font-medium">{nextMilestone.reward}</span>
              </p>
            )}
          </motion.div>

          {/* ── How it works ──────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="card">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
              How It Works
            </h2>
            <div className="space-y-4">
              {[
                { step: '1', title: 'Share your link',        body: 'Send your unique referral link to friends via any channel.' },
                { step: '2', title: 'Friend uploads CSV',     body: 'They analyze their portfolio — no purchase required to activate your discount.' },
                { step: '3', title: 'They get 20% off',       body: 'When they unlock a Pro Report, the discount applies automatically.' },
                { step: '4', title: 'You unlock rewards',     body: 'Hit milestones to earn free reports and lifetime pro access.' },
              ].map(({ step, title, body }) => (
                <div key={step} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400 shrink-0 mt-0.5">
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-200">{title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Active reward banner ──────────────────────────────────── */}
          {activeMilestone && (
            <motion.div
              variants={fadeUp}
              className="card border-green-800/40 bg-green-950/20 text-center"
            >
              <p className="text-2xl mb-2">{activeMilestone.icon}</p>
              <p className="text-sm font-bold text-green-300">
                You&apos;ve unlocked: {activeMilestone.reward}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Email us at <span className="text-gray-400">support@neufin.app</span> to claim your reward.
              </p>
            </motion.div>
          )}

          {/* ── CTA ───────────────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="text-center pb-6">
            <Link href="/results" className="btn-outline inline-block px-10 py-3 text-sm">
              ← Back to my DNA results
            </Link>
          </motion.div>

        </motion.div>
      </main>
    </div>
  )
}
