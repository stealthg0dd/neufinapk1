'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { debugAuth } from '@/lib/auth-debug'
import { upsertAdvisorProfile, type AdvisorProfile } from '@/lib/api'

const BRAND_COLORS = [
  '#1A56DB', '#8B5CF6', '#F97316', '#10B981',
  '#EF4444', '#EC4899', '#F59E0B', '#06B6D4',
]

const MAX_LOGO_KB = 200

export default function AdvisorSettingsPage() {
  const { user, token, loading } = useAuth()

  const [form, setForm] = useState<Omit<AdvisorProfile, 'id' | 'subscription_tier'>>({
    advisor_name:  '',
    firm_name:     '',
    calendar_link: '',
    logo_base64:   null,
    brand_color:   '#1A56DB',
    white_label:   false,
  })

  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    debugAuth('advisor/settings:mount')
  }, [])

  // Pre-fill from localStorage if available
  useEffect(() => {
    if (typeof window === 'undefined') return
    const cached = localStorage.getItem('advisorProfile')
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setForm(f => ({ ...f, ...parsed }))
        if (parsed.logo_base64) setLogoPreview(parsed.logo_base64)
      } catch {}
    }
  }, [])

  function handleField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_LOGO_KB * 1024) {
      setError(`Logo must be under ${MAX_LOGO_KB} KB`)
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string
      setLogoPreview(b64)
      handleField('logo_base64', b64)
    }
    reader.readAsDataURL(file)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.advisor_name.trim()) { setError('Advisor name is required'); return }
    if (!form.firm_name.trim())    { setError('Firm name is required'); return }

    setSaving(true)
    setError(null)
    try {
      await upsertAdvisorProfile(form, token)
      localStorage.setItem('advisorProfile', JSON.stringify(form))
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-shell-deep flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-shell-deep flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-2xl font-bold text-white">Sign in required</p>
        <p className="text-shell-subtle text-sm">You need an account to manage your advisor profile.</p>
        <Link href="/auth?next=/advisor/settings" className="btn-primary px-6 py-2">Sign In</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-shell-deep">
      {/* Nav */}
      <nav className="border-b border-shell-border/60 bg-shell-deep/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <div className="flex items-center gap-4">
            <Link href="/advisor/dashboard" className="text-shell-muted hover:text-white text-sm transition-colors">
              Dashboard
            </Link>
            <Link href="/results" className="text-shell-muted hover:text-white text-sm transition-colors">
              DNA Results
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto px-6 py-section w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl font-bold text-white mb-1">Advisor Settings</h1>
          <p className="text-shell-subtle text-sm mb-8">
            Personalise your white-label reports and client-facing profile.
          </p>

          <form onSubmit={handleSave} className="space-y-6">

            {/* ── Identity ── */}
            <section className="card space-y-4">
              <h2 className="text-sm font-semibold text-shell-fg/90 uppercase tracking-wider">Identity</h2>

              <div>
                <label className="block text-xs text-shell-muted mb-1">Advisor Name</label>
                <input
                  type="text"
                  value={form.advisor_name}
                  onChange={e => handleField('advisor_name', e.target.value)}
                  placeholder="e.g. Jane Smith, CFP"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-xs text-shell-muted mb-1">Firm Name</label>
                <input
                  type="text"
                  value={form.firm_name}
                  onChange={e => handleField('firm_name', e.target.value)}
                  placeholder="e.g. Smith Capital Advisors"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-xs text-shell-muted mb-1">Calendly / Booking Link</label>
                <input
                  type="url"
                  value={form.calendar_link}
                  onChange={e => handleField('calendar_link', e.target.value)}
                  placeholder="https://calendly.com/your-link"
                  className="input w-full"
                />
                <p className="text-xs text-shell-subtle mt-1">Shown as a CTA button when clients view their shared results.</p>
              </div>
            </section>

            {/* ── Branding ── */}
            <section className="card space-y-4">
              <h2 className="text-sm font-semibold text-shell-fg/90 uppercase tracking-wider">Branding</h2>

              {/* Logo upload */}
              <div>
                <label className="block text-xs text-shell-muted mb-2">Firm Logo</label>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <Image
                      src={logoPreview}
                      alt="Logo preview"
                      width={64}
                      height={64}
                      unoptimized
                      className="w-16 h-16 object-contain rounded-lg border border-shell-border bg-shell p-1"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-dashed border-shell-border bg-shell flex items-center justify-center text-shell-subtle text-xs text-center">
                      No<br/>Logo
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="btn-outline text-sm px-4 py-1.5"
                    >
                      {logoPreview ? 'Change Logo' : 'Upload Logo'}
                    </button>
                    {logoPreview && (
                      <button
                        type="button"
                        onClick={() => { setLogoPreview(null); handleField('logo_base64', null) }}
                        className="text-xs text-shell-subtle hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                    <p className="text-xs text-shell-subtle">PNG or JPG · max {MAX_LOGO_KB} KB</p>
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>

              {/* Brand color */}
              <div>
                <label className="block text-xs text-shell-muted mb-2">Brand Color</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {BRAND_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleField('brand_color', color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        form.brand_color === color
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-shell scale-110'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <div className="flex items-center gap-2 ml-1">
                    <input
                      type="color"
                      value={form.brand_color}
                      onChange={e => handleField('brand_color', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <span className="text-xs text-shell-subtle font-mono">{form.brand_color}</span>
                  </div>
                </div>
              </div>

              {/* White-label toggle */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm text-shell-fg/90 font-medium">White-label PDFs</p>
                  <p className="text-xs text-shell-subtle mt-0.5">Replace Neufin branding with your firm logo and colors in generated reports.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleField('white_label', !form.white_label)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.white_label ? 'bg-primary' : 'bg-shell-raised'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.white_label ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </section>

            {/* ── Preview card ── */}
            <section className="card space-y-3">
              <h2 className="text-sm font-semibold text-shell-fg/90 uppercase tracking-wider">Profile Preview</h2>
              <div
                className="rounded-xl p-4 flex items-center gap-4 border"
                style={{ borderColor: `${form.brand_color}40`, background: `${form.brand_color}10` }}
              >
                {logoPreview ? (
                  <Image
                    src={logoPreview}
                    alt="Logo preview"
                    width={48}
                    height={48}
                    unoptimized
                    className="w-12 h-12 object-contain rounded-lg bg-white/10 p-1"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: form.brand_color }}
                  >
                    {(form.firm_name || form.advisor_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {form.advisor_name || 'Your Name'}
                  </p>
                  <p className="text-shell-muted text-xs truncate">
                    {form.firm_name || 'Your Firm'}
                  </p>
                  {form.calendar_link && (
                    <p className="text-xs mt-1 truncate" style={{ color: form.brand_color }}>
                      Book a consultation →
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs text-shell-subtle">This card appears on results pages shared via your referral link.</p>
            </section>

            {/* ── Save ── */}
            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : saved ? (
                '✓ Saved'
              ) : (
                'Save Profile'
              )}
            </button>

            {saved && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-sm text-green-400"
              >
                Profile saved! Your branding will appear on all new PDF reports.
              </motion.p>
            )}
          </form>
        </motion.div>
      </main>
    </div>
  )
}
