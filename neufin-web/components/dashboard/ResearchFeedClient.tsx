'use client'

import { motion } from 'framer-motion'

type Note = {
  id: string
  title: string
  executive_summary: string
  confidence_score?: number
  generated_at: string
}

export default function ResearchFeedClient({ notes }: { notes: Note[] }) {
  if (!notes.length) {
    return (
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
        <p className="text-[var(--text-2)] text-sm">Research layer is analyzing markets. Check back soon.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {notes.map((note, index) => (
        <motion.div
          key={note.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: index * 0.1 }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4 border-l-4 border-l-[var(--amber)]"
        >
          <p className="font-semibold text-[var(--text)]">{note.title}</p>
          <p className="text-sm text-[var(--text-2)] line-clamp-2 mt-1">{note.executive_summary}</p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-[var(--text-2)] font-mono">
              Confidence {Math.round((note.confidence_score ?? 0) * 100)}%
            </span>
            <span className="text-[10px] text-[var(--text-2)] font-mono">
              {new Date(note.generated_at).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

