'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL

interface MarketRegime {
  regime: string
  confidence: number
  started_at: string
}

interface ResearchNote {
  id: string
  note_type: string
  title: string
  executive_summary: string
  regime?: string
  time_horizon?: string
  confidence_score?: number
  generated_at: string
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
  risk_on: 'Risk-On',
  risk_off: 'Risk-Off',
  stagflation: 'Stagflation',
  recovery: 'Recovery',
  recession_risk: 'Recession Risk',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })
}

function NoteTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    macro_outlook: 'Macro Outlook',
    sector_analysis: 'Sector Analysis',
    regime_change: 'Regime Change',
    risk_alert: 'Risk Alert',
  }
  return <span className="text-xs text-gray-500">{labels[type] ?? type.replace(/_/g, ' ')}</span>
}

export default function LiveResearch() {
  const [regime, setRegime] = useState<MarketRegime | null>(null)
  const [notes, setNotes]   = useState<ResearchNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [regimeRes, notesRes] = await Promise.all([
          fetch(`${API}/api/research/regime`, { cache: 'no-store' }),
          fetch(`${API}/api/research/notes?per_page=3`, { cache: 'no-store' }),
        ])
        if (regimeRes.ok) setRegime(await regimeRes.json())
        if (notesRes.ok) {
          const data = await notesRes.json()
          setNotes((data.notes ?? data ?? []).slice(0, 3))
        }
      } catch {}
      finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1,2,3].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-800/50" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Market Regime */}
      {regime && (
        <div className={`rounded-2xl border p-6 ${REGIME_COLORS[regime.regime] ?? 'text-gray-400 bg-gray-800 border-gray-700'}`}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Current Market Regime</p>
              <p className="text-2xl font-bold">{REGIME_LABELS[regime.regime] ?? regime.regime}</p>
              <p className="text-sm opacity-70 mt-1">
                Confidence: {(regime.confidence * 100).toFixed(0)}% · Active since {formatDate(regime.started_at)}
              </p>
            </div>
            <div className="text-right">
              <div className="rounded-xl border border-current/20 px-4 py-2 text-sm font-medium opacity-80">
                Live Signal
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Research Notes */}
      {notes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-100">Latest Research</h3>
            <Link href="/auth?next=/research" className="text-sm text-blue-400 hover:text-blue-300">
              Sign in for full access →
            </Link>
          </div>
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/research/${note.id}`}
              className="block rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-600 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <NoteTypeLabel type={note.note_type} />
                    {note.regime && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${REGIME_COLORS[note.regime] ?? 'text-gray-400 bg-gray-800 border-gray-700'}`}>
                        {REGIME_LABELS[note.regime] ?? note.regime}
                      </span>
                    )}
                    {note.time_horizon && (
                      <span className="text-[10px] text-gray-600">{note.time_horizon.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                  <h4 className="font-semibold text-gray-100 group-hover:text-white transition-colors">{note.title}</h4>
                  <p className="text-sm text-gray-400 leading-relaxed line-clamp-2">{note.executive_summary}</p>
                </div>
                <div className="flex-shrink-0 text-right space-y-1">
                  <p className="text-xs text-gray-600">{formatDate(note.generated_at)}</p>
                  {note.confidence_score && (
                    <p className="text-xs text-gray-600">{(note.confidence_score * 100).toFixed(0)}% confidence</p>
                  )}
                  <span className="text-xs text-blue-400 group-hover:text-blue-300">Read →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {notes.length === 0 && !regime && (
        <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center">
          <p className="text-gray-500 text-sm">Live research data will appear here once the intelligence layer is active.</p>
        </div>
      )}

      {/* CTA */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 text-center space-y-3">
        <p className="font-semibold text-gray-100">Access All Research Intelligence</p>
        <p className="text-sm text-gray-400">
          Semantic search, macro signals, sector analysis, and daily AI-generated research notes.
          Available on Retail plan and above.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link href="/auth" className="rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors">
            Sign up free
          </Link>
          <Link href="/pricing" className="text-sm text-gray-400 hover:text-gray-200">
            See all plans →
          </Link>
        </div>
      </div>
    </div>
  )
}
