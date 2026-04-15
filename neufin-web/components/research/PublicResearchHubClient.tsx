'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export type BlogNote = {
  id: string
  slug: string
  title: string
  executive_summary: string
  note_type: string
  confidence_score?: number
  created_at: string
  read_time_minutes: number
  asset_tickers: string[]
  meta_description: string
}

const TABS = ['ALL', 'MACRO_OUTLOOK', 'REGIME_CHANGE', 'SECTOR_ANALYSIS', 'BEHAVIORAL'] as const

function fmtType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function typeCls(t: string) {
  if (t.includes('macro')) return 'bg-warning/10 text-warning border-warning/30'
  if (t.includes('regime')) return 'bg-risk/10 text-risk border-risk/30'
  if (t.includes('sector')) return 'bg-primary/10 text-primary border-primary/30'
  return 'bg-accent/10 text-accent border-accent/30'
}

export default function PublicResearchHubClient({ notes }: { notes: BlogNote[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('ALL')
  const [page, setPage] = useState(1)
  const perPage = 9

  const filtered = useMemo(() => {
    if (tab === 'ALL') return notes
    if (tab === 'BEHAVIORAL') return notes.filter((n) => n.note_type.toLowerCase().includes('behavior'))
    return notes.filter((n) => n.note_type.toUpperCase() === tab)
  }, [notes, tab])

  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const current = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <>
      <div className="mb-10 flex flex-wrap items-center justify-center gap-2">
        {TABS.map((t) => {
          const active = t === tab
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t)
                setPage(1)
              }}
              className={[
                'rounded-full border px-3 py-1.5 text-sm font-mono transition-colors',
                active
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t === 'ALL' ? 'All' : fmtType(t)}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {current.map((note) => (
          <article
            key={note.id}
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/30"
          >
            <span className={`rounded-full border px-2 py-0.5 text-sm font-mono ${typeCls(note.note_type.toLowerCase())}`}>
              {fmtType(note.note_type)}
            </span>
            <h3 className="mb-2 mt-2 text-base font-semibold leading-snug text-foreground">{note.title}</h3>
            <p className="mb-3 line-clamp-3 text-[13px] text-muted-foreground">{note.executive_summary}</p>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-mono text-muted-foreground/60">
                {new Date(note.created_at).toLocaleDateString('en-SG', { dateStyle: 'medium' })}
              </span>
              <span className="font-mono text-primary">{Math.round((note.confidence_score ?? 0) * 100)}% confidence</span>
            </div>
            <Link href={`/research/${note.slug}`} className="mt-3 inline-block text-sm text-primary hover:underline">
              Read →
            </Link>
          </article>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded border border-border px-3 py-1 text-sm text-muted-foreground disabled:opacity-40"
        >
          Prev
        </button>
        <span className="px-3 text-sm text-muted-foreground">
          {page} / {pages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
          disabled={page >= pages}
          className="rounded border border-border px-3 py-1 text-sm text-muted-foreground disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </>
  )
}

