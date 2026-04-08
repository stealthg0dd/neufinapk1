'use client'

import { Sparkles, X } from 'lucide-react'

export function CopilotRail({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[hsl(var(--border)/0.4)] bg-copilot">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border)/0.4)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[hsl(var(--primary)/0.2)]">
            <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
          </div>
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">NeuFin Copilot</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
          aria-label="Close Copilot"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          Ask questions about your portfolio, regime context, and research notes. Full Copilot workflows ship in
          the next release.
        </p>
      </div>
    </aside>
  )
}
