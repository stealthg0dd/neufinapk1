'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

const API = process.env.NEXT_PUBLIC_API_URL

interface KeyFinding {
  finding: string
  data_support: string
  implication: string
}

interface ResearchNote {
  id: string
  note_type: string
  title: string
  executive_summary: string
  full_content?: string
  key_findings?: KeyFinding[]
  affected_sectors?: string[]
  affected_tickers?: string[]
  regime?: string
  time_horizon?: string
  confidence_score?: number
  generated_at: string
  generated_by?: string
  is_public: boolean
}

const REGIME_COLORS: Record<string, string> = {
  risk_on: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  risk_off: 'text-red-400 bg-red-500/10 border-red-500/30',
  stagflation: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  recovery: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  recession_risk: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
}

const REGIME_LABELS: Record<string, string> = {
  risk_on: 'Risk-On', risk_off: 'Risk-Off', stagflation: 'Stagflation',
  recovery: 'Recovery', recession_risk: 'Recession Risk',
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-800 ${className}`} />
}

export default function ResearchNotePage() {
  const params = useParams()
  const noteId = params?.note_id as string
  const { token, user } = useAuth()

  const [note, setNote]       = useState<ResearchNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [gated, setGated]     = useState(false)

  useEffect(() => {
    if (!noteId) return
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch(`${API}/api/research/notes/${noteId}`, {
          headers,
          cache: 'no-store',
        })
        if (res.status === 403) { setGated(true); return }
        if (res.status === 404) { setError('Research note not found.'); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setNote(await res.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [noteId, token])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 px-6 py-10 max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-32" />
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    )
  }

  if (gated) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-3xl">
            🔒
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Research Access Required</h2>
            <p className="text-gray-400 leading-relaxed">
              This research note requires a Retail plan or above. Sign up free to access our AI-generated market intelligence.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {!user ? (
              <Link href={`/auth?next=/research/${noteId}`} className="rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition-colors">
                Sign In / Sign Up
              </Link>
            ) : (
              <Link href="/pricing" className="rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition-colors">
                Upgrade Plan
              </Link>
            )}
            <Link href="/research" className="text-sm text-gray-400 hover:text-gray-200">
              Back to Research
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <p className="text-red-400">{error}</p>
          <Link href="/research" className="mt-3 inline-block text-sm text-gray-400 hover:text-gray-200">← Back to Research</Link>
        </div>
      </div>
    )
  }

  if (!note) return null

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 sticky top-0 z-10 bg-gray-950/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold">NeuFin</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/research" className="text-gray-400 hover:text-gray-100">← Research</Link>
            {!user && (
              <Link href="/auth" className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white">
                Sign Up Free
              </Link>
            )}
          </div>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* Metadata */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 uppercase tracking-widest">
              {note.note_type.replace(/_/g, ' ')}
            </span>
            {note.regime && (
              <span className={`rounded-full px-3 py-0.5 text-xs font-medium border ${REGIME_COLORS[note.regime] ?? 'text-gray-400 bg-gray-800 border-gray-700'}`}>
                {REGIME_LABELS[note.regime] ?? note.regime}
              </span>
            )}
            {note.time_horizon && (
              <span className="rounded-full bg-gray-800 text-gray-400 px-3 py-0.5 text-xs">
                {note.time_horizon.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight">{note.title}</h1>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Generated {fmt(note.generated_at)}</span>
            {note.generated_by && <span>by {note.generated_by}</span>}
            {note.confidence_score && (
              <span className="text-emerald-500">{(note.confidence_score * 100).toFixed(0)}% confidence</span>
            )}
          </div>
        </div>

        {/* Executive Summary */}
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">Executive Summary</p>
          <p className="text-gray-200 leading-relaxed text-base">{note.executive_summary}</p>
        </div>

        {/* Key Findings */}
        {note.key_findings && note.key_findings.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Key Findings</h2>
            <div className="space-y-3">
              {note.key_findings.map((f, i) => (
                <div key={i} className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
                  <p className="font-semibold text-gray-100">{f.finding}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Data Support</p>
                      <p className="text-sm text-gray-400">{f.data_support}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Implication</p>
                      <p className="text-sm text-gray-400">{f.implication}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Full content */}
        {note.full_content && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Full Analysis</h2>
            <div className="prose prose-invert prose-sm max-w-none">
              <div className="text-gray-400 leading-relaxed whitespace-pre-wrap text-sm">{note.full_content}</div>
            </div>
          </section>
        )}

        {/* Affected sectors / tickers */}
        {((note.affected_sectors && note.affected_sectors.length > 0) ||
          (note.affected_tickers && note.affected_tickers.length > 0)) && (
          <section className="grid sm:grid-cols-2 gap-4">
            {note.affected_sectors && note.affected_sectors.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Affected Sectors</p>
                <div className="flex flex-wrap gap-2">
                  {note.affected_sectors.map((s) => (
                    <span key={s} className="rounded-full bg-gray-800 text-gray-300 px-3 py-1 text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {note.affected_tickers && note.affected_tickers.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Mentioned Tickers</p>
                <div className="flex flex-wrap gap-2">
                  {note.affected_tickers.map((t) => (
                    <span key={t} className="rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20 px-3 py-1 text-xs font-mono">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Disclaimer */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            This research note is AI-generated by NeuFin&apos;s synthesis agent using data from public macro sources. 
            It is not financial advice. Past performance does not indicate future results. 
            Please consult a licensed financial advisor before making investment decisions.
          </p>
        </div>

        {/* Back link */}
        <div>
          <Link href="/research" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Back to Research Hub
          </Link>
        </div>

      </article>
    </div>
  )
}
