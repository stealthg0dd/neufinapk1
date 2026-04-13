'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

const API = process.env.NEXT_PUBLIC_API_URL

export default function NewClientPage() {
  const { token } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({ client_name: '', client_email: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleField(key: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) { setError('Not authenticated'); return }
    if (!form.client_name.trim()) { setError('Client name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/advisor/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Could not add client')
      }
      router.push('/advisor/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-shell-deep text-shell-fg px-4 py-section">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/advisor/dashboard" className="text-shell-subtle hover:text-shell-fg/90 text-sm">
            ← Back
          </Link>
          <div>
            <h1 className="text-xl font-bold">Add New Client</h1>
            <p className="text-sm text-shell-muted">Create a client portfolio in your dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-shell-border bg-shell p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-shell-fg/90 mb-1.5">Client Name *</label>
            <input
              type="text"
              required
              value={form.client_name}
              onChange={(e) => handleField('client_name', e.target.value)}
              placeholder="e.g. John Tan"
              className="w-full rounded-lg border border-shell-border bg-shell-raised px-3 py-2.5 text-sm text-shell-fg placeholder:text-shell-subtle focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-shell-fg/90 mb-1.5">Client Email</label>
            <input
              type="email"
              value={form.client_email}
              onChange={(e) => handleField('client_email', e.target.value)}
              placeholder="client@example.com (optional)"
              className="w-full rounded-lg border border-shell-border bg-shell-raised px-3 py-2.5 text-sm text-shell-fg placeholder:text-shell-subtle focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-shell-fg/90 mb-1.5">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => handleField('notes', e.target.value)}
              placeholder="Investment objectives, risk tolerance, key concerns..."
              className="w-full rounded-lg border border-shell-border bg-shell-raised px-3 py-2.5 text-sm text-shell-fg placeholder:text-shell-subtle focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 text-sm font-semibold text-white transition-colors"
          >
            {saving ? 'Adding client…' : 'Add Client'}
          </button>
        </form>

        <div className="rounded-xl border border-shell-border bg-shell/50 p-4">
          <p className="text-xs text-shell-subtle">
            After adding the client, you can upload their portfolio CSV from the advisor dashboard to run a DNA analysis and generate white-label reports.
          </p>
        </div>
      </div>
    </div>
  )
}
