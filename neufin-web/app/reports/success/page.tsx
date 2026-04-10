'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type ReportStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'timeout'
const MAX_ATTEMPTS = 40

export default function ReportSuccessPage() {
  const [reportStatus, setReportStatus] = useState<ReportStatus>('pending')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [reportId, setReportId] = useState<string | null>(null)

  useEffect(() => {
    const fromStorage = typeof window !== 'undefined' ? localStorage.getItem('pendingReportId') : null
    if (!fromStorage) {
      setReportStatus('timeout')
      return
    }
    setReportId(fromStorage)
  }, [])

  useEffect(() => {
    if (!reportId) return
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/reports/fulfill?report_id=${reportId}`)
        if (!res.ok) {
          console.error('[fulfill] HTTP error:', res.status)
          setAttempts((a) => {
            const next = a + 1
            if (next >= MAX_ATTEMPTS) setReportStatus('timeout')
            return next
          })
          return
        }
        const data = await res.json()
        if (cancelled) return

        if (data.status === 'ready' && data.pdf_url) {
          setReportStatus('ready')
          setPdfUrl(data.pdf_url)
          if (typeof window !== 'undefined') localStorage.removeItem('pendingReportId')
          return
        }

        if (data.status === 'failed') {
          setReportStatus('failed')
          return
        }

        if (data.status === 'generating' || data.status === 'pending') {
          setReportStatus('generating')
          setAttempts((a) => {
            const next = a + 1
            if (next >= MAX_ATTEMPTS) setReportStatus('timeout')
            return next
          })
        }
      } catch (err) {
        console.error('[fulfill] Poll error:', err)
      }
    }

    const timer = setInterval(() => {
      void poll()
    }, 3000)
    void poll()

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [reportId])

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm transition-colors">
            Return to Dashboard
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md space-y-4">
          {(reportStatus === 'pending' || reportStatus === 'generating') && (
            <div className="card space-y-5 text-center">
              <h1 className="text-2xl font-bold text-white">Generating your IC report...</h1>
              <p className="text-sm text-gray-400">
                This takes 60-90 seconds for full institutional analysis.
              </p>
              <div className="h-2 w-full overflow-hidden rounded bg-gray-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(95, Math.round((attempts / MAX_ATTEMPTS) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-gray-600">Attempt {attempts} / {MAX_ATTEMPTS}</p>
            </div>
          )}

          {reportStatus === 'ready' && (
            <div className="card space-y-4 text-center">
              <div className="text-5xl text-emerald-400">✓</div>
              <h1 className="text-2xl font-bold text-white">Your IC report is ready</h1>
              <button
                type="button"
                onClick={() => window.open(pdfUrl || '', '_blank')}
                className="btn-primary w-full py-3"
              >
                Download Report
              </button>
              <Link href="/dashboard" className="btn-outline block w-full py-3 text-center">
                Return to Dashboard
              </Link>
            </div>
          )}

          {reportStatus === 'failed' && (
            <div className="card space-y-4 text-center">
              <div className="text-4xl text-red-400">✕</div>
              <h1 className="text-xl font-bold text-white">Report generation failed</h1>
              <a href="mailto:info@neufin.ai" className="text-sm text-red-300 underline">
                Contact support: info@neufin.ai
              </a>
              <Link href="/dashboard" className="btn-outline block w-full py-3 text-center">
                Return to Dashboard
              </Link>
            </div>
          )}

          {reportStatus === 'timeout' && (
            <div className="card space-y-4 text-center">
              <h1 className="text-xl font-bold text-white">Still generating - this is taking longer than usual</h1>
              <p className="text-sm text-gray-400">Your report will be emailed to you when ready.</p>
              <Link href="/dashboard" className="btn-outline block w-full py-3 text-center">
                Return to Dashboard
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
