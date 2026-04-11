'use client'
export const dynamic = 'force-dynamic'

/**
 * /onboarding — New-user setup flow (shown once after first login).
 *
 * Step A — About You: role selection + full name
 * Step B — Your Firm: white-label branding (advisor / pm / enterprise only)
 * Step C — Confirm: preview of branded report header → /dashboard
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { apiFetch, apiGet } from '@/lib/api-client'

// ── Types ──────────────────────────────────────────────────────────────────────
type UserType = 'retail' | 'advisor' | 'pm' | 'enterprise'

interface WLConfig {
  useWhiteLabel: boolean
  firmName: string
  advisorName: string
  advisorEmail: string
  brandColor: string
  logoUrl: string | null
}

// ── Animation ──────────────────────────────────────────────────────────────────
const slide = {
  hidden:  { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0,  transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, x: -32, transition: { duration: 0.22 } },
}

// ── Role cards config ──────────────────────────────────────────────────────────
const ROLES: { type: UserType; title: string; subtitle: string; icon: string }[] = [
  { type: 'retail',     title: 'Individual Investor',       subtitle: 'Personal portfolio management',        icon: '📈' },
  { type: 'advisor',    title: 'Financial Advisor / IFA',   subtitle: 'Client reporting & white-label PDFs',  icon: '🏦' },
  { type: 'pm',         title: 'Portfolio Manager / PE',    subtitle: 'Multi-portfolio IC-grade analytics',   icon: '🏢' },
  { type: 'enterprise', title: 'Platform / B2B Integration', subtitle: 'API access & custom deployments',    icon: '⚡' },
]

const NEEDS_WL = (t: UserType) => t === 'advisor' || t === 'pm' || t === 'enterprise'

// ── Main component ─────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const { token, loading: authLoading } = useAuth()

  const [step, setStep]     = useState<'A' | 'B' | 'C'>('A')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Step A
  const [userType, setUserType]   = useState<UserType | null>(null)
  const [fullName, setFullName]   = useState('')

  // Step B
  const [wl, setWl] = useState<WLConfig>({
    useWhiteLabel: false,
    firmName: '',
    advisorName: '',
    advisorEmail: '',
    brandColor: '#1EB8CC',
    logoUrl: null,
  })
  const [logoFile, setLogoFile]     = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/auth')
    }
  }, [token, authLoading, router])

  // Check if onboarding already completed → skip straight to dashboard
  useEffect(() => {
    if (!token) return
    apiGet<{ onboarding_completed: boolean }>('/api/profile/white-label')
      .then((data) => {
        if (data.onboarding_completed) router.replace('/dashboard')
      })
      .catch(() => { /* new user — proceed */ })
  }, [token, router])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Logo file selection ────────────────────────────────────────────────────
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return wl.logoUrl
    setUploadingLogo(true)
    try {
      const form = new FormData()
      form.append('file', logoFile)
      const res = await apiFetch('/api/profile/logo', { method: 'POST', body: form })
      if (!res.ok) return wl.logoUrl
      const data = await res.json() as { logo_url?: string }
      return data.logo_url ?? null
    } catch {
      return wl.logoUrl
    } finally {
      setUploadingLogo(false)
    }
  }

  // ── Step A → B/C ──────────────────────────────────────────────────────────
  const handleStepA = () => {
    if (!userType) { setError('Please select your role.'); return }
    setError(null)
    setStep(NEEDS_WL(userType) ? 'B' : 'C')
  }

  // ── Step B → C ────────────────────────────────────────────────────────────
  const handleStepB = () => {
    setError(null)
    setStep('C')
  }

  // ── Final submit ──────────────────────────────────────────────────────────
  const handleComplete = async () => {
    setSaving(true)
    setError(null)
    try {
      let finalLogoUrl = wl.logoUrl
      if (wl.useWhiteLabel && logoFile) {
        finalLogoUrl = await uploadLogo()
        setWl((w) => ({ ...w, logoUrl: finalLogoUrl }))
      }

      const res = await apiFetch('/api/profile/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          user_type: userType,
          full_name: fullName.trim() || undefined,
          firm_name: wl.useWhiteLabel ? wl.firmName || undefined : undefined,
          advisor_name: wl.useWhiteLabel ? wl.advisorName || undefined : undefined,
          advisor_email: wl.useWhiteLabel ? wl.advisorEmail || undefined : undefined,
          white_label_enabled: wl.useWhiteLabel,
          brand_primary_color: wl.useWhiteLabel ? wl.brandColor : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string }
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      router.push('/dashboard')
    } catch (e) {
      setError((e as Error).message || 'Could not save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const displayName = wl.useWhiteLabel && wl.advisorName ? wl.advisorName : fullName || 'Your Name'
  const displayFirm = wl.useWhiteLabel && wl.firmName ? wl.firmName : 'NeuFin Intelligence'
  const displayLogo = logoPreview ?? wl.logoUrl

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="text-[#1EB8CC] font-bold text-xl tracking-tight mb-1">NeuFin</div>
        <h1 className="text-2xl font-semibold text-[#F0F4FF]">Let&apos;s set you up</h1>
        <p className="text-sm text-[#64748B] mt-1">Takes about 60 seconds</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(['A', 'B', 'C'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              step === s ? 'bg-[#1EB8CC] text-[#0B0F14]'
                : (step === 'B' && s === 'A') || (step === 'C' && s !== 'C') ? 'bg-[#1EB8CC]/30 text-[#1EB8CC]'
                : 'bg-[#161D2E] text-[#64748B] border border-[#2A3550]'
            }`}>{i + 1}</div>
            {i < 2 && <div className="w-8 h-px bg-[#2A3550]" />}
          </div>
        ))}
      </div>

      {/* Step card */}
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait">

          {/* ── STEP A ── */}
          {step === 'A' && (
            <motion.div key="A" variants={slide} initial="hidden" animate="visible" exit="exit">
              <div className="bg-[#161D2E] border border-[#2A3550] rounded-2xl p-7">
                <h2 className="text-lg font-semibold text-[#F0F4FF] mb-1">About you</h2>
                <p className="text-sm text-[#64748B] mb-6">What best describes your role?</p>

                <div className="grid grid-cols-1 gap-3 mb-6">
                  {ROLES.map((r) => (
                    <button
                      key={r.type}
                      onClick={() => setUserType(r.type)}
                      className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                        userType === r.type
                          ? 'border-[#1EB8CC] bg-[#1EB8CC]/10'
                          : 'border-[#2A3550] hover:border-[#3A4560] hover:bg-[#1A2030]'
                      }`}
                    >
                      <span className="text-2xl">{r.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-[#F0F4FF]">{r.title}</div>
                        <div className="text-xs text-[#64748B] mt-0.5">{r.subtitle}</div>
                      </div>
                      {userType === r.type && (
                        <div className="ml-auto w-5 h-5 rounded-full bg-[#1EB8CC] flex items-center justify-center text-[#0B0F14] text-xs">✓</div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="mb-6">
                  <label className="block text-xs text-[#64748B] mb-1.5">Your full name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full bg-[#0B0F14] border border-[#2A3550] rounded-lg px-3 py-2.5 text-sm text-[#F0F4FF] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#1EB8CC]/40 focus:border-[#1EB8CC]/60"
                  />
                </div>

                {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

                <button
                  onClick={handleStepA}
                  className="w-full py-2.5 rounded-xl bg-[#1EB8CC] text-[#0B0F14] text-sm font-semibold hover:bg-[#18a8ba] transition-colors"
                >
                  Continue →
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP B ── */}
          {step === 'B' && (
            <motion.div key="B" variants={slide} initial="hidden" animate="visible" exit="exit">
              <div className="bg-[#161D2E] border border-[#2A3550] rounded-2xl p-7">
                <h2 className="text-lg font-semibold text-[#F0F4FF] mb-1">Your firm</h2>
                <p className="text-sm text-[#64748B] mb-6">
                  Would you like to white-label NeuFin reports with your firm&apos;s branding?
                </p>

                {/* WL toggle */}
                <div className="flex gap-3 mb-6">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setWl((w) => ({ ...w, useWhiteLabel: v }))}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        wl.useWhiteLabel === v
                          ? 'border-[#1EB8CC] bg-[#1EB8CC]/10 text-[#1EB8CC]'
                          : 'border-[#2A3550] text-[#64748B] hover:border-[#3A4560]'
                      }`}
                    >
                      {v ? 'Yes, use my branding' : 'No, use NeuFin branding'}
                    </button>
                  ))}
                </div>

                <AnimatePresence>
                  {wl.useWhiteLabel && (
                    <motion.div
                      key="wl-form"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 mb-6">
                        <div>
                          <label className="block text-xs text-[#64748B] mb-1.5">Firm name</label>
                          <input
                            type="text"
                            value={wl.firmName}
                            onChange={(e) => setWl((w) => ({ ...w, firmName: e.target.value }))}
                            placeholder="Acme Capital Management"
                            className="w-full bg-[#0B0F14] border border-[#2A3550] rounded-lg px-3 py-2.5 text-sm text-[#F0F4FF] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#1EB8CC]/40 focus:border-[#1EB8CC]/60"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#64748B] mb-1.5">Your name as it appears on reports</label>
                          <input
                            type="text"
                            value={wl.advisorName}
                            onChange={(e) => setWl((w) => ({ ...w, advisorName: e.target.value }))}
                            placeholder="Jane Smith, CFA"
                            className="w-full bg-[#0B0F14] border border-[#2A3550] rounded-lg px-3 py-2.5 text-sm text-[#F0F4FF] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#1EB8CC]/40 focus:border-[#1EB8CC]/60"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[#64748B] mb-1.5">Contact email for reports</label>
                          <input
                            type="email"
                            value={wl.advisorEmail}
                            onChange={(e) => setWl((w) => ({ ...w, advisorEmail: e.target.value }))}
                            placeholder="jane@acmecapital.com"
                            className="w-full bg-[#0B0F14] border border-[#2A3550] rounded-lg px-3 py-2.5 text-sm text-[#F0F4FF] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#1EB8CC]/40 focus:border-[#1EB8CC]/60"
                          />
                        </div>

                        {/* Logo upload */}
                        <div>
                          <label className="block text-xs text-[#64748B] mb-1.5">
                            Firm logo <span className="text-[#3A4560]">(PNG or SVG, recommended 300×100 px)</span>
                          </label>
                          <input
                            ref={fileRef}
                            type="file"
                            accept="image/png,image/svg+xml,image/jpeg,image/webp"
                            onChange={handleLogoSelect}
                            className="hidden"
                          />
                          <div
                            onClick={() => fileRef.current?.click()}
                            className="flex items-center gap-3 p-3 bg-[#0B0F14] border border-dashed border-[#2A3550] rounded-lg cursor-pointer hover:border-[#1EB8CC]/50 transition-colors"
                          >
                            {logoPreview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={logoPreview} alt="Logo preview" className="h-8 object-contain rounded" />
                            ) : (
                              <div className="text-[#64748B] text-xs">Click to upload logo</div>
                            )}
                            <span className="ml-auto text-[#1EB8CC] text-xs">{logoFile ? 'Change' : 'Upload'}</span>
                          </div>
                        </div>

                        {/* Brand color */}
                        <div>
                          <label className="block text-xs text-[#64748B] mb-1.5">
                            Primary brand color <span className="text-[#3A4560]">(optional)</span>
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={wl.brandColor}
                              onChange={(e) => setWl((w) => ({ ...w, brandColor: e.target.value }))}
                              className="w-10 h-9 rounded border border-[#2A3550] bg-[#0B0F14] cursor-pointer p-0.5"
                            />
                            <input
                              type="text"
                              value={wl.brandColor}
                              onChange={(e) => setWl((w) => ({ ...w, brandColor: e.target.value }))}
                              className="flex-1 bg-[#0B0F14] border border-[#2A3550] rounded-lg px-3 py-2.5 text-sm text-[#F0F4FF] font-mono focus:outline-none focus:ring-2 focus:ring-[#1EB8CC]/40"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('A')}
                    className="px-5 py-2.5 rounded-xl border border-[#2A3550] text-sm text-[#64748B] hover:bg-[#1A2030] transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStepB}
                    className="flex-1 py-2.5 rounded-xl bg-[#1EB8CC] text-[#0B0F14] text-sm font-semibold hover:bg-[#18a8ba] transition-colors"
                  >
                    Preview →
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── STEP C ── */}
          {step === 'C' && (
            <motion.div key="C" variants={slide} initial="hidden" animate="visible" exit="exit">
              <div className="bg-[#161D2E] border border-[#2A3550] rounded-2xl p-7">
                <h2 className="text-lg font-semibold text-[#F0F4FF] mb-1">You&apos;re almost set</h2>
                <p className="text-sm text-[#64748B] mb-6">
                  Here&apos;s how your reports will appear:
                </p>

                {/* Report header preview */}
                <div className="rounded-xl overflow-hidden border border-[#2A3550] mb-6">
                  {/* Colored top strip */}
                  <div className="h-1.5" style={{ background: wl.useWhiteLabel ? wl.brandColor : '#1EB8CC' }} />
                  <div className="bg-[#0B0F14] px-5 py-4 flex items-center gap-4">
                    {displayLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={displayLogo} alt="Firm logo" className="h-10 object-contain" />
                    ) : (
                      <div className="text-[#1EB8CC] font-bold text-base tracking-tight">
                        {displayFirm.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="text-[10px] text-[#64748B] uppercase tracking-widest mb-0.5">
                        Portfolio Intelligence Report
                      </div>
                      <div className="text-sm font-semibold text-[#F0F4FF]">{displayFirm}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[#64748B]">Prepared by</div>
                      <div className="text-xs text-[#CBD5E1] font-medium">{displayName}</div>
                    </div>
                  </div>
                  <div className="bg-[#0D1118] px-5 py-2 flex items-center justify-between">
                    <div className="text-[10px] text-[#3A4560]">RESTRICTED — INVESTMENT COMMITTEE USE ONLY</div>
                    {wl.useWhiteLabel ? (
                      <div className="text-[10px] text-[#3A4560]">{displayFirm} · Confidential</div>
                    ) : (
                      <div className="text-[10px] text-[#3A4560]">Powered by NeuFin Intelligence</div>
                    )}
                  </div>
                </div>

                {/* Summary bullets */}
                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm text-[#CBD5E1]">
                    <span className="text-[#1EB8CC]">✓</span>
                    Role: <strong className="text-[#F0F4FF]">{ROLES.find((r) => r.type === userType)?.title}</strong>
                  </div>
                  {wl.useWhiteLabel && wl.firmName && (
                    <div className="flex items-center gap-2 text-sm text-[#CBD5E1]">
                      <span className="text-[#1EB8CC]">✓</span>
                      White-label: <strong className="text-[#F0F4FF]">{wl.firmName}</strong>
                    </div>
                  )}
                  {!wl.useWhiteLabel && (
                    <div className="flex items-center gap-2 text-sm text-[#CBD5E1]">
                      <span className="text-[#1EB8CC]">✓</span>
                      Reports branded with <strong className="text-[#F0F4FF]">NeuFin Intelligence</strong>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#3A4560] mb-6">
                  You can update your branding anytime from Dashboard → Settings.
                </p>

                {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(NEEDS_WL(userType!) ? 'B' : 'A')}
                    className="px-5 py-2.5 rounded-xl border border-[#2A3550] text-sm text-[#64748B] hover:bg-[#1A2030] transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void handleComplete()}
                    disabled={saving || uploadingLogo}
                    className="flex-1 py-2.5 rounded-xl bg-[#1EB8CC] text-[#0B0F14] text-sm font-semibold hover:bg-[#18a8ba] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {saving || uploadingLogo ? (
                      <>
                        <div className="w-4 h-4 border-2 border-[#0B0F14] border-t-transparent rounded-full animate-spin" />
                        Saving…
                      </>
                    ) : 'Complete Setup →'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      <p className="mt-8 text-xs text-[#2A3550]">
        NeuFin OÜ · Confidential · EU Registered
      </p>
    </div>
  )
}
