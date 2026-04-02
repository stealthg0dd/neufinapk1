'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { fulfillReport } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { trackEvent, EVENTS } from '@/components/Analytics'
import { useNeufinAnalytics } from '@/lib/analytics'

// ── Poll config ───────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3_000
const MAX_ATTEMPTS     = 20          // 60 seconds total before giving up

// ── Progress steps shown during generation ────────────────────────────────────
const STEPS = [
  { label: 'Payment confirmed',           minAttempt: 0  },
  { label: 'Fetching live price data',    minAttempt: 1  },
  { label: 'Running AI deep analysis',    minAttempt: 3  },
  { label: 'Calculating risk metrics',    minAttempt: 6  },
  { label: 'Generating 10-page PDF',      minAttempt: 9  },
  { label: 'Uploading to secure storage', minAttempt: 13 },
  { label: 'Report ready',               minAttempt: 20 },
]

type Phase = 'polling' | 'ready' | 'error' | 'missing'

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportSuccessPage() {
  const { token } = useAuth()
  const { capture } = useNeufinAnalytics()

  const [phase,    setPhase]    = useState<Phase>('polling')
  const [attempt,  setAttempt]  = useState(0)
  const [pdfUrl,   setPdfUrl]   = useState<string | null>(null)
  const [stepIdx,  setStepIdx]  = useState(0)

  const reportIdRef = useRef<string | null>(null)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── On mount: resolve report_id ───────────────────────────────────────────
  useEffect(() => {
    const fromStorage = localStorage.getItem('pendingReportId')
    if (!fromStorage) {
      setPhase('missing')
      return
    }
    reportIdRef.current = fromStorage
    poll(0)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // ── Polling logic ─────────────────────────────────────────────────────────
  function poll(n: number) {
    setAttempt(n)

    // Advance visual step
    const nextStep = STEPS.findLastIndex((s) => s.minAttempt <= n)
    setStepIdx(Math.max(0, nextStep))

    if (n >= MAX_ATTEMPTS) {
      setPhase('error')
      return
    }

    fulfillReport(reportIdRef.current!, token)
      .then(({ pdf_url }) => {
        setPdfUrl(pdf_url)
        setStepIdx(STEPS.length - 1)
        setPhase('ready')
        localStorage.removeItem('pendingReportId')
        trackEvent(EVENTS.PAYMENT_SUCCEEDED, { report_id: reportIdRef.current })
        capture('advisor_report_purchased', {
          plan_type: 'advisor_report',
          price:     29,
          report_id: reportIdRef.current,
        })
      })
      .catch(() => {
        // Not ready yet — schedule next poll
        timerRef.current = setTimeout(() => poll(n + 1), POLL_INTERVAL_MS)
      })
  }

  // ── Progress bar width ────────────────────────────────────────────────────
  const progressPct = phase === 'ready'
    ? 100
    : Math.min(95, Math.round((attempt / MAX_ATTEMPTS) * 100))

  // ── Current step label ────────────────────────────────────────────────────
  const currentStep = STEPS[Math.min(stepIdx, STEPS.length - 1)]

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <Link href="/results" className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to results
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">

            {/* ── Missing report ID ──────────────────────────────────── */}
            {phase === 'missing' && (
              <motion.div
                key="missing"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="card text-center"
              >
                <p className="text-4xl mb-4">🔍</p>
                <h1 className="text-xl font-bold text-white mb-2">No pending report found</h1>
                <p className="text-gray-500 text-sm mb-6">
                  This page is meant for post-payment delivery. If you just paid, try refreshing.
                </p>
                <Link href="/results" className="btn-primary inline-block">
                  Back to Results →
                </Link>
              </motion.div>
            )}

            {/* ── Polling / generating ───────────────────────────────── */}
            {phase === 'polling' && (
              <motion.div
                key="polling"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Header */}
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center gap-2 text-blue-400 text-sm font-medium">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
                    Generating Your Report
                  </div>
                  <h1 className="text-2xl font-bold text-white">Payment Confirmed 🎉</h1>
                  <p className="text-gray-500 text-sm">Your 10-page advisor PDF is being generated. This takes 5–15 seconds.</p>
                </div>

                {/* Progress bar */}
                <div className="card space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Progress</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={currentStep.label}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.25 }}
                      className="text-sm text-blue-300 font-medium"
                    >
                      {currentStep.label}…
                    </motion.p>
                  </AnimatePresence>
                </div>

                {/* Step checklist */}
                <div className="card space-y-2.5">
                  {STEPS.slice(0, -1).map((step, i) => {
                    const done    = i < stepIdx
                    const current = i === stepIdx
                    return (
                      <div key={step.label} className="flex items-center gap-3">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs shrink-0
                          ${done    ? 'bg-green-500/20 text-green-400'
                          : current ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-800 text-gray-600'}`}
                        >
                          {done ? '✓' : current ? '·' : '·'}
                        </span>
                        <span className={`text-sm ${
                          done ? 'text-green-400 line-through decoration-green-500/40'
                          : current ? 'text-blue-300 font-medium'
                          : 'text-gray-600'}`}
                        >
                          {step.label}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <p className="text-center text-xs text-gray-700">
                  Checking every {POLL_INTERVAL_MS / 1000}s · attempt {attempt + 1} of {MAX_ATTEMPTS}
                </p>
              </motion.div>
            )}

            {/* ── Ready ─────────────────────────────────────────────── */}
            {phase === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="card text-center space-y-5"
              >
                <div>
                  <div className="text-5xl mb-3">📄</div>
                  <h1 className="text-2xl font-bold text-white">Your Report is Ready</h1>
                  <p className="text-gray-500 text-sm mt-1">
                    Your 10-page AI Advisor Report has been generated.
                  </p>
                </div>

                {/* What's inside recap */}
                <div className="text-left space-y-1.5 border border-gray-800 rounded-xl p-4">
                  {[
                    '📊 Detailed Sector Exposure',
                    '📉 Annualized Volatility & Risk Metrics',
                    '🎯 Actionable Buy / Sell Signals',
                    '🏦 Advisor-Ready White-label Formatting',
                  ].map((item) => (
                    <p key={item} className="text-sm text-gray-300">{item}</p>
                  ))}
                </div>

                <a
                  href={pdfUrl!}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    trackEvent(EVENTS.PDF_DOWNLOADED, { source: 'success_page' })
                    capture('advisor_report_downloaded', { report_id: reportIdRef.current })
                  }}
                  className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-base"
                >
                  ⬇ Download Your Advisor Report (PDF)
                </a>

                <Link
                  href="/results"
                  className="block text-center text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  ← Back to your DNA results
                </Link>
              </motion.div>
            )}

            {/* ── Error / timeout ────────────────────────────────────── */}
            {phase === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="card text-center space-y-4"
              >
                <p className="text-4xl">⏳</p>
                <h1 className="text-xl font-bold text-white">Still generating…</h1>
                <p className="text-gray-500 text-sm">
                  Your report is taking longer than expected. Check back in a moment — your PDF will be waiting.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setPhase('polling'); setAttempt(0); poll(0) }}
                    className="btn-primary w-full py-3"
                  >
                    Try again
                  </button>
                  <Link href="/results" className="btn-outline w-full py-3 text-center">
                    Back to Results
                  </Link>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
