'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet } from '@/lib/api-client'

export type ResearchFeedNote = {
  id: string
  title: string
  executive_summary: string
  confidence_score?: number
  generated_at: string
  note_type?: string
}

function stripeClass(noteType?: string) {
  const u = (noteType ?? '').toUpperCase()
  if (u.includes('MACRO')) return 'bg-warning'
  if (u.includes('SECTOR')) return 'bg-primary'
  if (u.includes('REGIME')) return 'bg-risk'
  return 'bg-accent'
}

/** Self-fetching research feed. Accepts an optional `notes` prop for SSR
 *  pre-population OR a `limit` prop to fetch client-side. Includes an 8s
 *  timeout so it never spins forever when the endpoint is slow/empty. */
export default function ResearchFeedClient({
  notes: notesProp,
  limit = 5,
}: {
  notes?: ResearchFeedNote[]
  limit?: number
}) {
  const [notes, setNotes] = useState<ResearchFeedNote[]>(notesProp ?? [])
  const [loading, setLoading] = useState(!notesProp)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // If notes were pre-populated via props, skip client fetch
    if (notesProp && notesProp.length > 0) return

    let cancelled = false
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setLoading(false)
        // Don't set error on timeout — just show empty state message
      }
    }, 8000)

    apiGet<ResearchFeedNote[] | { notes?: ResearchFeedNote[] }>(
      `/api/research/notes?limit=${limit}`
    )
      .then((data) => {
        if (cancelled) return
        clearTimeout(timeout)
        const arr = Array.isArray(data) ? data : (data?.notes ?? [])
        setNotes(arr)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        clearTimeout(timeout)
        setError('Failed to load research')
        setLoading(false)
      })

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [limit, notesProp])

  if (loading) {
    return (
      <div style={{ color: '#64748B', fontSize: 12, padding: '16px 0' }}>
        Loading research intelligence...
      </div>
    )
  }

  if (error || notes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-section"
      >
        <p className="text-sm text-muted-foreground">
          {error
            ? 'Research feed temporarily unavailable.'
            : 'Research notes are published daily at 06:00 SGT.'}
        </p>
        {error && (
          <p className="mt-1 text-sm text-muted-foreground/60">
            Check back shortly — our research agents publish multiple times a day.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => {
        const stripe = stripeClass(note.note_type)
        const conf = Math.round((note.confidence_score ?? 0) * 100)
        return (
          <div
            key={note.id}
            className="relative overflow-hidden rounded-lg border border-border bg-surface p-4 pl-5 transition-colors hover:border-primary/20"
          >
            <div
              className={`absolute bottom-3 left-0 top-3 w-0.5 rounded-full ${stripe}`}
              aria-hidden
            />
            <div className="flex items-start justify-between gap-2">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-sm font-mono uppercase tracking-wider text-muted-foreground">
                {(note.note_type ?? 'note').replace(/_/g, ' ')}
              </span>
              <span className="shrink-0 text-sm font-mono text-muted-foreground">
                {conf}% conf
              </span>
            </div>
            <h3 className="mb-1 mt-1.5 text-sm font-medium leading-snug text-foreground">
              {note.title}
            </h3>
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {note.executive_summary}
            </p>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-sm font-mono text-muted-foreground/60">
                {new Date(note.generated_at).toLocaleString('en-SG', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
              <Link
                href={`/research/${note.id}`}
                className="cursor-pointer text-sm text-primary"
              >
                Read →
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
