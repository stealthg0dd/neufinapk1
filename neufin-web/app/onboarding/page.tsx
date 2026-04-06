'use client'
export const dynamic = 'force-dynamic'

/**
 * /onboarding — New-user onboarding flow.
 *
 * Step 1: User-type selection (Investor | Advisor).
 * Step 2: Advisor only — firm name + optional logo upload.
 * Step 3: Stores user_type + onboarding_complete in Supabase auth
 *         user_metadata, then redirects to the correct destination.
 *
 * Redirects to /auth if the user isn't logged in yet.
 * Redirects to /dashboard (or localStorage "onboarding_next") once done.
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { debugAuth } from '@/lib/auth-debug'
import { upsertAdvisorProfile } from '@/lib/api'
import { useNeufinAnalytics } from '@/lib/analytics'

type UserType = 'investor' | 'advisor'

const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -16, transition: { duration: 0.25 } },
}

function OnboardingContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { token, loading: authLoading } = useAuth()
  const { capture } = useNeufinAnalytics()

  const [step, setStep]         = useState<1 | 2 | 3>(1)
    // For portfolio upload (step 3)
    const [csvFile, setCsvFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
  const [userType, setUserType] = useState<UserType | null>(null)
  const [firmName, setFirmName] = useState('')
  const [logoB64, setLogoB64]   = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    debugAuth('onboarding:mount')
  }, [])

  const fileRef = useRef<HTMLInputElement>(null)

  // Redirect unauthenticated visitors back to /auth
  useEffect(() => {
    if (!authLoading && !token) {
      const hint = searchParams.get('user_type') ? `&user_type=${searchParams.get('user_type')}` : ''
      router.replace(`/login?next=/onboarding${hint}`)
    }
  }, [authLoading, token, router, searchParams])

  // Pre-select user_type if passed via URL (?user_type=advisor from landing CTA)
  useEffect(() => {
    const hint = searchParams.get('user_type') as UserType | null
    if (hint === 'investor' || hint === 'advisor') {
      setUserType(hint)
    }
  }, [searchParams])

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1_000_000) { setError('Logo must be under 1 MB'); return }
    const reader = new FileReader()
    reader.onload = () => setLogoB64(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handlePortfolioUpload() {
    if (!token || !csvFile) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', csvFile)
      const res = await fetch('/api/portfolio/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      await supabase.auth.updateUser({
        data: { user_type: 'investor', onboarding_complete: true },
      })
      capture('onboarding_completed', { steps_skipped: 1, user_type: 'investor' })
      const dest = localStorage.getItem('onboarding_next') || '/dashboard'
      localStorage.removeItem('onboarding_next')
      router.replace(dest)
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  async function handleInvestorContinue() {
    if (!token) return
    setStep(3)
  }

  async function handleAdvisorContinue() {
    if (!token) return
    if (!firmName.trim()) { setError('Please enter your firm name.'); return }
    setSaving(true)
    setError(null)
    try {
      // Save advisor profile (firm name + optional logo)
      await upsertAdvisorProfile(
        { firm_name: firmName.trim(), logo_base64: logoB64 ?? undefined, white_label: true },
        token,
      )
      // Mark onboarding complete
      await supabase.auth.updateUser({
        data: { user_type: 'advisor', onboarding_complete: true },
      })
      capture('onboarding_completed', { steps_skipped: 0, user_type: 'advisor' })
      const dest = localStorage.getItem('onboarding_next') || '/advisor/dashboard'
      localStorage.removeItem('onboarding_next')
      router.replace(dest)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-16">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-10">
        {[1, 2].map((n) => (
          <div
            key={n}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              n <= step ? 'w-8 bg-blue-500' : 'w-4 bg-gray-700'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Step 1: User-type selection ─────────────────────────────── */}
        {step === 1 && (
          <motion.div
            key="step1"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-lg"
          >
            <h1 className="text-3xl font-bold text-white text-center mb-2">Welcome to Neufin</h1>
            <p className="text-gray-400 text-center mb-10">How will you use Neufin?</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {/* Investor option */}
              <button
                onClick={() => setUserType('investor')}
                className={`glass-card rounded-2xl p-6 text-left flex flex-col gap-3 transition-all duration-200 border-2 ${
                  userType === 'investor'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700/60 hover:border-blue-500/40'
                }`}
              >
                <span className="text-3xl">🧬</span>
                <div>
                  <p className="font-semibold text-white">Retail Investor</p>
                  <p className="text-sm text-gray-400 mt-1">Upload my portfolio and discover my investor DNA score.</p>
                </div>
                <span className="text-xs text-gray-500 mt-auto">Free to start · no account required for analysis</span>
              </button>

              {/* Advisor option */}
              <button
                onClick={() => setUserType('advisor')}
                className={`glass-card rounded-2xl p-6 text-left flex flex-col gap-3 transition-all duration-200 border-2 ${
                  userType === 'advisor'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700/60 hover:border-purple-500/40'
                }`}
              >
                <span className="text-3xl">💼</span>
                <div>
                  <p className="font-semibold text-white">Financial Advisor</p>
                  <p className="text-sm text-gray-400 mt-1">Generate white-label PDF reports for my clients.</p>
                </div>
                <span className="text-xs text-gray-500 mt-auto">$99/mo for unlimited reports</span>
              </button>
            </div>

            {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

            <button
              disabled={!userType || saving}
              onClick={() => {
                if (userType === 'investor') handleInvestorContinue()
                else setStep(2)
              }}
              className="btn-primary w-full py-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Continue →'}
            </button>
          </motion.div>
        )}

        {/* ── Step 2: Advisor setup ──────────────────────────────────── */}
        {step === 2 && (
          <motion.div
            key="step2"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-lg"
          >
            <button
              onClick={() => setStep(1)}
              className="text-gray-500 text-sm hover:text-gray-300 mb-6 flex items-center gap-1 transition-colors"
            >
              ← Back
            </button>

            <h1 className="text-2xl font-bold text-white mb-1">Set up your advisor profile</h1>
            <p className="text-gray-400 text-sm mb-8">Your firm name and logo appear on every white-label report.</p>

            {/* Firm name */}
            <label className="block mb-5">
              <span className="text-sm text-gray-300 mb-1.5 block">Firm name <span className="text-red-400">*</span></span>
              <input
                type="text"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                placeholder="e.g. Apex Capital Advisors"
                className="w-full rounded-xl bg-gray-900 border border-gray-700 px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/60 transition-colors text-sm"
              />
            </label>

            {/* Logo upload (optional) */}
            <label className="block mb-8">
              <span className="text-sm text-gray-300 mb-1.5 block">Logo <span className="text-gray-500">(optional · PNG / JPG · max 1 MB)</span></span>
              <div
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-gray-700 hover:border-purple-500/40 p-6 text-center cursor-pointer transition-colors flex flex-col items-center gap-2"
              >
                {logoB64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoB64} alt="Logo preview" className="h-16 object-contain rounded" />
                ) : (
                  <>
                    <span className="text-2xl">🖼️</span>
                    <span className="text-gray-500 text-sm">Click to upload logo</span>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleLogoChange}
              />
            </label>

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <button
              disabled={saving}
              onClick={handleAdvisorContinue}
              className="btn-primary w-full py-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Creating profile…' : 'Launch Advisor Dashboard →'}
            </button>
            <p className="text-xs text-gray-600 text-center mt-3">You can update these settings any time in your profile.</p>
          </motion.div>
        )}

        {/* ── Step 3: Portfolio upload for investors ─────────────────── */}
        {step === 3 && userType === 'investor' && (
          <motion.div
            key="step3"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-lg"
          >
            <h1 className="text-2xl font-bold text-white mb-1">Upload Your Portfolio</h1>
            <p className="text-gray-400 text-sm mb-8">Upload your portfolio CSV to receive your DNA score and analysis.</p>

            <input
              type="file"
              accept=".csv"
              onChange={e => setCsvFile(e.target.files?.[0] || null)}
              className="mb-4"
            />
            {uploadError && <p className="text-red-400 text-sm mb-4">{uploadError}</p>}

            <button
              disabled={!csvFile || uploading}
              onClick={handlePortfolioUpload}
              className="btn-primary w-full py-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading…' : 'Analyze Portfolio →'}
            </button>
            <p className="text-xs text-gray-600 text-center mt-3">CSV format only. Example: symbol,shares,price</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
