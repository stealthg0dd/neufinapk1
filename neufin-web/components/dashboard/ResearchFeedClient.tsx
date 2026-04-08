'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'

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
  if (u.includes('SECTOR')) return 'bg-[hsl(var(--primary))]'
  if (u.includes('REGIME')) return 'bg-risk'
  return 'bg-[hsl(var(--accent))]'
}

export default function ResearchFeedClient({ notes }: { notes: ResearchFeedNote[] }) {
  if (!notes.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-surface py-12">
        <Loader2 className="mb-3 h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Research layer analyzing markets...</p>
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
            className="relative overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-surface p-4 pl-5 transition-colors hover:border-[hsl(var(--primary)/0.2)]"
          >
            <div
              className={`absolute bottom-3 left-0 top-3 w-0.5 rounded-full ${stripe}`}
              aria-hidden
            />
            <div className="flex items-start justify-between gap-2">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                {(note.note_type ?? 'note').replace(/_/g, ' ')}
              </span>
              <span className="shrink-0 text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
                {conf}% conf
              </span>
            </div>
            <h3 className="mb-1 mt-1.5 text-sm font-medium leading-snug text-[hsl(var(--foreground))]">
              {note.title}
            </h3>
            <p className="line-clamp-2 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              {note.executive_summary}
            </p>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground)/0.6)]">
                {new Date(note.generated_at).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <Link href={`/research/${note.id}`} className="cursor-pointer text-[11px] text-[hsl(var(--primary))]">
                Read →
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
