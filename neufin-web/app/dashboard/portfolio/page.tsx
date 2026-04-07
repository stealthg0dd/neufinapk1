'use client'

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { apiFetch, apiGet, apiPost, apiPostForm } from '@/lib/api-client'
import type { DNAAnalysisResponse } from '@/lib/api'

const STAGES = [
  { label: 'Reading your holdings...', pct: 25 },
  { label: 'Calculating risk metrics...', pct: 50 },
  { label: 'Running AI analysis...', pct: 80 },
  { label: 'Generating insights...', pct: 100 },
]

export default function PortfolioPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [result, setResult] = useState<DNAAnalysisResponse | null>(null)
  const [displayScore, setDisplayScore] = useState(0)
  const [plan, setPlan] = useState<'free' | 'retail' | 'advisor' | 'enterprise'>('free')

  const fileSize = useMemo(() => (file ? `${(file.size / 1024).toFixed(1)} KB` : ''), [file])
  const portfolioId = result?.portfolio_id ?? null
  const riskLevel = useMemo(() => {
    const score = result?.dna_score ?? 0
    if (score >= 70) return 'Low'
    if (score >= 40) return 'Moderate'
    return 'High'
  }, [result?.dna_score])
  const isAdvisorPlan = plan === 'advisor' || plan === 'enterprise'

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f?.name.toLowerCase().endsWith('.csv') && f.size <= 10 * 1024 * 1024) setFile(f)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f?.name.toLowerCase().endsWith('.csv') && f.size <= 10 * 1024 * 1024) setFile(f)
  }

  const runAnalyze = async () => {
    if (!file) return
    setBusy(true)
    setResult(null)
    let i = 0
    const timer = window.setInterval(() => {
      const s = STAGES[Math.min(i, STAGES.length - 1)]
      setStage(s.label)
      setProgress(s.pct)
      i += 1
    }, 1800)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await apiPostForm<DNAAnalysisResponse>('/api/analyze-dna', formData)
      setResult(data)
      localStorage.setItem('neufin-last-analysis', JSON.stringify(data))
      setProgress(100)
    } finally {
      window.clearInterval(timer)
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!result?.dna_score) {
      setDisplayScore(0)
      return
    }
    const score = result.dna_score
    const duration = 1500
    const steps = 60
    const increment = score / steps
    let current = 0
    const timer = window.setInterval(() => {
      current += increment
      if (current >= score) {
        setDisplayScore(score)
        window.clearInterval(timer)
      } else {
        setDisplayScore(Math.floor(current))
      }
    }, duration / steps)
    return () => window.clearInterval(timer)
  }, [result?.dna_score])

  useEffect(() => {
    if (!result) return
    apiGet<{ plan: 'free' | 'retail' | 'advisor' | 'enterprise' }>('/api/subscription/status')
      .then((res) => setPlan(res.plan))
      .catch(() => setPlan('free'))
  }, [result])

  const handleDownloadReport = async () => {
    if (!portfolioId) {
      toast.error('Portfolio ID missing. Re-run analysis and try again.')
      return
    }
    try {
      setDownloadLoading(true)
      const statusRes = await apiGet<{ plan: 'free' | 'retail' | 'advisor' | 'enterprise' }>(
        '/api/subscription/status'
      )
      const currentPlan = statusRes.plan
      setPlan(currentPlan)

      if (currentPlan === 'advisor' || currentPlan === 'enterprise') {
        const res = await apiFetch('/api/reports/generate', {
          method: 'POST',
          body: JSON.stringify({ portfolio_id: portfolioId, advisor_id: 'self' }),
        })
        if (!res.ok) {
          throw new Error('Report generation failed')
        }
        const data = (await res.json()) as { pdf_url?: string }
        if (!data.pdf_url) {
          throw new Error('PDF URL missing')
        }
        const pdfRes = await fetch(data.pdf_url)
        if (!pdfRes.ok) throw new Error('Could not download generated report')
        const blob = await pdfRes.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `neufin-report-${Date.now()}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const { checkout_url } = await apiPost<{ checkout_url: string }>(
          '/api/reports/checkout',
          { plan: 'single', portfolio_id: portfolioId }
        )
        window.location.href = checkout_url
      }
    } catch {
      toast.error('Report unavailable. Try again.')
    } finally {
      setDownloadLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`border border-amber-500/20 bg-[#0F1420] rounded-lg p-10 text-center cursor-pointer transition-colors relative overflow-hidden ${
          dragging ? 'border-[var(--amber)]' : 'border-[var(--amber)]/50 border-dashed'
        }`}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        <input ref={inputRef} type="file" accept=".csv" onChange={onPick} className="hidden" />
        <p className="text-3xl text-[var(--amber)] mb-3">↑</p>
        <p className="text-lg font-semibold">Drop your portfolio CSV here</p>
        <p className="text-sm text-[var(--text-2)] mt-1">or click to browse (CSV, max 10MB)</p>
      </div>

      {file && (
        <div className="border border-amber-500/20 bg-[#0F1420] rounded-lg p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
          <p className="font-mono text-sm">{file.name}</p>
          <p className="text-xs text-[var(--text-2)]">{fileSize} · Ready to analyze</p>
        </div>
      )}

      <button
        onClick={runAnalyze}
        disabled={!file || busy}
        className="px-6 py-3 rounded-xl bg-[var(--amber)] text-[#111] font-semibold disabled:opacity-50"
      >
        Analyze Portfolio
      </button>

      {busy && (
        <div className="border border-amber-500/20 bg-[#0F1420] rounded-lg p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
          <p className="text-sm text-[var(--text-2)] mb-2">{stage}</p>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div className="h-full bg-[var(--amber)]" animate={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          <div className="border border-amber-500/20 bg-[#0F1420] rounded-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
            <div className="flex items-center gap-6">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,.15)" strokeWidth="10" fill="none" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  stroke="var(--amber)"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(result.dna_score / 100) * 327} 327`}
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div>
                <p className="text-[var(--text-2)] text-sm">DNA Score</p>
                <motion.p className="font-mono text-5xl text-[var(--amber)]">{displayScore}</motion.p>
                <span className={`px-3 py-1 rounded text-xs font-mono font-medium ${
                  riskLevel === 'Low'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : riskLevel === 'Moderate'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  Risk: {riskLevel}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard label="Total Value" value={`$${Math.round(result.total_value).toLocaleString()}`} />
            <MetricCard label="Positions" value={String(result.num_positions)} />
            <MetricCard label="Max Position %" value={`${result.max_position_pct.toFixed(1)}%`} />
            {'weighted_beta' in result && <MetricCard label="Weighted Beta" value={String((result as any).weighted_beta)} />}
            {'avg_correlation' in result && <MetricCard label="Avg Correlation" value={String((result as any).avg_correlation)} />}
            {'num_priced' in result && <MetricCard label="Priced Tickers" value={String((result as any).num_priced)} />}
          </div>

          <div className="space-y-2">
            {[...(result.strengths || []), ...(result.weaknesses || []), result.recommendation]
              .filter(Boolean)
              .slice(0, 3)
              .map((rec, i) => (
                <div key={i} className="border border-amber-500/20 bg-[#0F1420] rounded-lg p-4 border-l-4 border-l-[var(--amber)] relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                  <p className="text-sm text-[var(--text)]">{rec}</p>
                </div>
              ))}
          </div>

          {!!result.positions?.length && (
            <div className="border border-amber-500/20 bg-[#0F1420] rounded-lg p-0 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-white/40 uppercase tracking-widest text-xs">
                  <tr>
                    <th className="text-left px-4 py-3">Symbol</th>
                    <th className="text-right px-4 py-3">Shares</th>
                    <th className="text-right px-4 py-3">Price</th>
                    <th className="text-right px-4 py-3">Value</th>
                    <th className="text-right px-4 py-3">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {result.positions.slice(0, 10).map((p) => (
                    <tr key={p.symbol} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 font-mono">{p.symbol}</td>
                      <td className="px-4 py-3 text-right font-mono">{p.shares.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono">${p.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono">${Math.round(p.value).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono">{(p.weight * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => localStorage.setItem('neufin-last-analysis', JSON.stringify(result))}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/10"
            >
              Save to Dashboard
            </button>
            <button
              onClick={handleDownloadReport}
              disabled={downloadLoading || !portfolioId}
              className="px-4 py-2 rounded-lg border border-[var(--amber)] text-[var(--amber)] disabled:opacity-50 flex items-center gap-2"
            >
              {downloadLoading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  Preparing report...
                </>
              ) : isAdvisorPlan ? (
                'Download PDF Report'
              ) : (
                'Get Full Report — $49'
              )}
            </button>
            {!isAdvisorPlan && (
              <Link href="/pricing" className="px-4 py-2 rounded-lg border border-[var(--amber)] text-[var(--amber)]">
                Advisor report available on Pro plan
              </Link>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-amber-500/20 bg-[#0F1420] rounded-lg p-4 hover:border-amber-500/40 transition-all duration-200 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <p className="text-xs text-[var(--text-2)]">{label}</p>
      <p className="font-mono text-lg mt-1">{value}</p>
    </div>
  )
}

