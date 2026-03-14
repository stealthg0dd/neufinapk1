import type { Metadata } from 'next'
import Link from 'next/link'
import CopyButton from './CopyButton'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface DNAShare {
  id: string
  dna_score: number
  investor_type: string
  strengths: string[]
  weaknesses: string[]
  recommendation: string
  share_token: string
  view_count: number
  created_at: string
}

async function getDNAData(token: string): Promise<DNAShare | null> {
  try {
    const res = await fetch(`${API}/api/dna/share/${token}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

const TYPE_CONFIG: Record<string, { emoji: string; color: string }> = {
  'Diversified Strategist':  { emoji: '⚖️',  color: '#3b82f6' },
  'Conviction Growth':       { emoji: '🚀',  color: '#8b5cf6' },
  'Momentum Trader':         { emoji: '⚡',  color: '#f59e0b' },
  'Defensive Allocator':     { emoji: '🛡️', color: '#22c55e' },
  'Speculative Investor':    { emoji: '🎯',  color: '#ef4444' },
}

export async function generateMetadata({
  params,
}: {
  params: { token: string }
}): Promise<Metadata> {
  const data = await getDNAData(params.token)

  if (!data) {
    return { title: 'Neufin — Share' }
  }

  const cfg = TYPE_CONFIG[data.investor_type]
  const title = `${cfg?.emoji ?? '🧬'} My Investor DNA: ${data.dna_score}/100`
  const description = `I'm a "${data.investor_type}" investor. What's your investing personality? Analyze your portfolio free on Neufin.`
  const url = `https://neufin.vercel.app/share/${data.share_token}`

  return {
    title: `${title} | Neufin`,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'Neufin',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      creator: '@neufin',
    },
  }
}

function ScoreArc({ score }: { score: number }) {
  const color =
    score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'
  const r = 52
  const circ = 2 * Math.PI * r
  const fill = circ - (score / 100) * circ

  return (
    <svg width="140" height="140" className="-rotate-90" aria-hidden>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#1f2937" strokeWidth="10" />
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
      />
    </svg>
  )
}

export default async function SharePage({
  params,
}: {
  params: { token: string }
}) {
  const data = await getDNAData(params.token)

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-2xl">🔍</p>
        <h1 className="text-xl font-bold">Score not found</h1>
        <p className="text-gray-400 text-sm">This link may have expired or never existed.</p>
        <Link href="/upload" className="btn-primary">Analyze your portfolio →</Link>
      </div>
    )
  }

  const cfg = TYPE_CONFIG[data.investor_type] ?? { emoji: '🧬', color: '#3b82f6' }
  const scoreColor =
    data.dna_score >= 70 ? '#22c55e' : data.dna_score >= 40 ? '#f59e0b' : '#ef4444'
  const shareUrl =
    typeof window === 'undefined'
      ? `https://neufin.vercel.app/share/${data.share_token}`
      : `${window.location.origin}/share/${data.share_token}`

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <Link href="/upload" className="btn-primary py-2 text-sm">
            Get My Score →
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-start px-6 py-10 max-w-3xl mx-auto w-full">

        {/* Share card — this is the viral unit */}
        <div
          className="w-full rounded-2xl border border-gray-800 overflow-hidden"
          style={{
            background: `radial-gradient(ellipse at top left, ${cfg.color}18 0%, transparent 60%), #0d1117`,
          }}
        >
          {/* Card header */}
          <div className="px-8 pt-8 pb-4 flex items-center justify-between border-b border-gray-800/60">
            <span className="text-sm font-bold text-gradient tracking-wide">Neufin Investor DNA</span>
            <span className="text-xs text-gray-600">
              {new Date(data.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
          </div>

          {/* Score + type */}
          <div className="px-8 py-8 flex flex-col sm:flex-row items-center gap-8">
            <div className="relative shrink-0">
              <ScoreArc score={data.dna_score} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold" style={{ color: scoreColor }}>
                  {data.dna_score}
                </span>
                <span className="text-xs text-gray-500 uppercase tracking-wider">/100</span>
              </div>
            </div>

            <div className="text-center sm:text-left">
              <div className="text-3xl mb-2">{cfg.emoji}</div>
              <h1 className="text-2xl font-bold text-white leading-tight">{data.investor_type}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {data.view_count} investors have viewed this
              </p>
            </div>
          </div>

          {/* Strengths + weaknesses */}
          <div className="px-8 pb-8 grid sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-3">
                💪 Strengths
              </h3>
              <ul className="space-y-2">
                {data.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-300">
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
                {data.weaknesses.map((w, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-300">
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
            style={{ background: `${cfg.color}10`, borderColor: `${cfg.color}30` }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: cfg.color }}>
              🎯 AI Recommendation
            </p>
            <p className="text-sm text-gray-300 leading-relaxed">{data.recommendation}</p>
          </div>

          {/* Card footer brand watermark */}
          <div className="px-8 py-4 border-t border-gray-800/60 flex items-center justify-between">
            <span className="text-xs text-gray-600">neufin.vercel.app</span>
            <span className="text-xs text-gray-600 font-mono">{data.share_token}</span>
          </div>
        </div>

        {/* Share actions */}
        <div className="w-full mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <CopyButton url={`https://neufin.vercel.app/share/${data.share_token}`} />
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
              `I just got my Investor DNA Score: ${data.dna_score}/100 🧬\nI'm a "${data.investor_type}"\n\nWhat kind of investor are you? → https://neufin.vercel.app/share/${data.share_token}`
            )}`}
            target="_blank" rel="noreferrer"
            className="bg-sky-600/80 hover:bg-sky-500/80 text-white text-xs font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            𝕏 Twitter/X
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `Check out my Investor DNA Score: ${data.dna_score}/100 🧬 I'm a "${data.investor_type}".\n\nFind out yours free → https://neufin.vercel.app/share/${data.share_token}`
            )}`}
            target="_blank" rel="noreferrer"
            className="bg-[#25D366]/80 hover:bg-[#25D366] text-white text-xs font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            WhatsApp
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(`https://neufin.vercel.app/share/${data.share_token}`)}&text=${encodeURIComponent(`My Investor DNA: ${data.dna_score}/100 — I'm a "${data.investor_type}" 🧬`)}`}
            target="_blank" rel="noreferrer"
            className="bg-[#2AABEE]/80 hover:bg-[#2AABEE] text-white text-xs font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            Telegram
          </a>
        </div>

        {/* Referral CTA — send link, friends get 20% off */}
        <div className="w-full mt-4 card border-purple-800/30 bg-purple-950/20">
          <p className="text-sm font-semibold text-purple-300 mb-1">🎁 Refer a friend, they get 20% off</p>
          <p className="text-xs text-gray-500 mb-3">
            Share your referral link — anyone who buys an Advisor Report through it gets 20% off automatically.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 truncate">
              {`https://neufin.vercel.app/upload?ref=${data.share_token}`}
            </code>
            <CopyButton url={`https://neufin.vercel.app/upload?ref=${data.share_token}`} />
          </div>
        </div>

        {/* CTA */}
        <div className="w-full mt-4 card text-center border-blue-800/30 bg-gradient-to-br from-blue-950/40 to-purple-950/30">
          <p className="text-gray-300 mb-1 font-semibold">What's your Investor DNA?</p>
          <p className="text-gray-500 text-sm mb-4">Upload your portfolio CSV — analysis takes under 10 seconds.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/upload" className="btn-primary inline-block">
              Analyze My Portfolio →
            </Link>
            <Link href="/leaderboard" className="btn-outline inline-block text-sm">
              🏆 View Leaderboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
