'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

export function ResearchSubscribeForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.includes('@')) {
      toast.error('Enter a valid email')
      return
    }
    try {
      setBusy(true)
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed.split('@')[0] || 'Research subscriber',
          email: trimmed,
          source: 'research',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const d = typeof (j as { detail?: unknown }).detail === 'string' ? (j as { detail: string }).detail : 'Could not subscribe'
        throw new Error(d)
      }
      toast.success('You are on the list')
      setEmail('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Subscribe failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Get weekly macro intelligence from NeuFin agents
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? '…' : 'Subscribe'}
        </button>
      </div>
    </form>
  )
}
