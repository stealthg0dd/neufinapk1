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
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) {
      setError('Not authenticated')
      return
    }
    if (!form.client_name.trim()) {
      setError('Client name is required')
      return
    }
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
    <div className="min-h-screen bg-app py-section text-navy">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 md:px-0">
        <div className="flex items-center gap-4">
          <Link href="/advisor/dashboard" className="text-sm text-muted2 transition-colors hover:text-primary-dark">
            ← Back
          </Link>
          <div>
            <h1 className="text-xl font-bold text-navy">Add New Client</h1>
            <p className="text-sm text-muted2">Create a client portfolio in your dashboard</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-primary/30 bg-white p-6 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy">Client Name *</label>
              <input
                type="text"
                required
                value={form.client_name}
                onChange={(e) => handleField('client_name', e.target.value)}
                placeholder="e.g. John Tan"
                className="input-base text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-navy">Client Email</label>
              <input
                type="email"
                value={form.client_email}
                onChange={(e) => handleField('client_email', e.target.value)}
                placeholder="client@example.com (optional)"
                className="input-base text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-navy">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => handleField('notes', e.target.value)}
              placeholder="Investment objectives, risk tolerance, key concerns..."
              className="input-base resize-none text-sm"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? 'Adding client…' : 'Add Client'}
          </button>
        </form>

        <div className="rounded-xl border border-primary/30 bg-primary-light/40 p-4">
          <p className="text-xs text-muted2">
            After adding the client, you can upload their portfolio CSV from the advisor dashboard to run a DNA
            analysis and generate white-label reports.
          </p>
        </div>
      </div>
    </div>
  )
}
