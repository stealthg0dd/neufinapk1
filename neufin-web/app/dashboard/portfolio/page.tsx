'use client'

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { Brain, Check, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react'
import { apiFetch, apiGet, apiPost } from '@/lib/api-client'
import type { DNAAnalysisResponse } from '@/lib/api'
import { KPICard } from '@/components/ui/KPICard'
import { supabase } from '@/lib/supabase'

const STAGES = [
  { label: 'Reading your holdings...', pct: 25, sub: 'Parsing CSV rows and mapping tickers' },
  { label: 'Calculating risk metrics...', pct: 50, sub: 'Beta, concentration, correlation' },
  { label: 'Running AI analysis...', pct: 80, sub: 'Multi-model behavioral analysis' },
  { label: 'Generating insights...', pct: 100, sub: 'Narrative strengths and recommendations' },
]

/** Circumference for r=58 (140×140 SVG, stroke 12) */
const RING_C = 2 * Math.PI * 58

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
  const [reportAt, setReportAt] = useState<string | null>(null)

  const fileSize = useMemo(() => (file ? `${(file.size / 1024).toFixed(1)} KB` : ''), [file])
  const portfolioId = result?.portfolio_id ?? null
  const riskLevel = useMemo(() => {
    const score = result?.dna_score ?? 0
    if (score >= 70) return 'Low'
    if (score >= 40) return 'Moderate'
    return 'High'
  }, [result?.dna_score])
  const isAdvisorPlan = plan === 'advisor' || plan === 'enterprise'

  const activeStageIndex = useMemo(() => {
    const idx = STAGES.findIndex((s) => s.label === stage)
    return idx >= 0 ? idx : 0
  }, [stage])

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
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/api/analyze-dna', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })

      if (res.status === 402) {
        const payload = await res.json().catch(() => ({} as any))
        const checkoutUrl =
          payload?.checkout_url ?? payload?.detail?.checkout_url ?? payload?.detail?.upgrade_url ?? null
        if (typeof checkoutUrl === 'string' && checkoutUrl) {
          window.location.href = checkoutUrl
          return
        }
        toast.error('Trial expired. Subscribe to upload a new portfolio.')
        return
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => ({} as any))
        toast.error(typeof payload?.detail === 'string' ? payload.detail : 'Upload failed. Try again.')
        return
      }

      const data = (await res.json()) as DNAAnalysisResponse
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

  useEffect(() => {
    if (!result) {
      setReportAt(null)
      return
    }
    setReportAt(new Date().toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }))
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

  const insightItems = useMemo(
    () => [...(result?.strengths || []), ...(result?.weaknesses || []), result?.recommendation].filter(Boolean).slice(0, 3),
    [result],
  )

  const metricEntries = useMemo(() => {
    if (!result) return []
    const rows: { label: string; value: string }[] = [
      { label: 'Total Value', value: `$${Math.round(result.total_value).toLocaleString()}` },
      { label: 'Positions', value: String(result.num_positions) },
      { label: 'Max Position %', value: `${result.max_position_pct.toFixed(1)}%` },
    ]
    if ('weighted_beta' in result) {
      rows.push({
        label: 'Weighted Beta',
        value: String((result as DNAAnalysisResponse & { weighted_beta?: unknown }).weighted_beta),
      })
    }
    if ('avg_correlation' in result) {
      rows.push({
        label: 'Avg Correlation',
        value: String((result as DNAAnalysisResponse & { avg_correlation?: unknown }).avg_correlation),
      })
    }
    if ('num_priced' in result) {
      rows.push({ label: 'Priced Tickers', value: String((result as DNAAnalysisResponse).num_priced) })
    }
    return rows
  }, [result])

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
          dragging
            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]'
            : 'border-[hsl(var(--border))] bg-[hsl(var(--surface)/0.5)] hover:border-[hsl(var(--primary)/0.4)] hover:bg-surface'
        }`}
      >
        <input ref={inputRef} type="file" accept=".csv" onChange={onPick} className="hidden" />
        {!file ? (
          <>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-surface-2">
              <UploadCloud className="h-7 w-7 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
            </div>
            <p className="mb-1 text-lg font-semibold text-[hsl(var(--foreground))]">Drop your portfolio CSV</p>
            <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">or click to browse</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="rounded border border-[hsl(var(--border)/0.5)] bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-[hsl(var(--muted-foreground)/0.6)]">
                .CSV
              </span>
              <span className="rounded border border-[hsl(var(--border)/0.5)] bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-[hsl(var(--muted-foreground)/0.6)]">
                .XLSX
              </span>
              <span className="rounded border border-[hsl(var(--border)/0.5)] bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-[hsl(var(--muted-foreground)/0.6)]">
                MAX 10MB
              </span>
            </div>
          </>
        ) : (
          <div
            className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-positive/10">
                <FileSpreadsheet className="h-5 w-5 text-positive" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{file.name}</p>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{fileSize}</p>
              </div>
              <span className="shrink-0 rounded px-2 py-0.5 font-mono text-[10px] text-positive bg-positive/10">
                Ready to analyze
              </span>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          void runAnalyze()
        }}
        disabled={!file || busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] font-medium text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          'Analyze Portfolio'
        )}
      </button>

      {busy && (
        <div className="rounded-xl border border-[hsl(var(--border))] bg-surface p-6">
          <p className="mb-6 text-[10px] font-mono uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
            Analysis in progress
          </p>
          <div className="space-y-0">
            {STAGES.map((s, j) => {
              const done = j < activeStageIndex
              const active = j === activeStageIndex && busy
              return (
                <div
                  key={s.label}
                  className="flex items-center gap-3 border-b border-[hsl(var(--border)/0.4)] py-3 last:border-0"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                      done
                        ? 'border-positive/50 bg-positive/20 text-positive'
                        : active
                          ? 'border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]'
                          : 'border-[hsl(var(--border)/0.5)] bg-surface-2 text-[hsl(var(--muted-foreground))]'
                    }`}
                  >
                    {done ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      j + 1
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${active ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}
                    >
                      {s.label}
                    </p>
                    <p className="text-[11px] text-[hsl(var(--muted-foreground)/0.6)]">{s.sub}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {done ? (
                      <Check className="ml-auto h-4 w-4 text-positive" strokeWidth={2} />
                    ) : active ? (
                      <span className="font-mono text-[11px] text-[hsl(var(--primary))]">{progress}%</span>
                    ) : (
                      <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground)/0.5)]">—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-[hsl(var(--primary))]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.7 }}
            />
          </div>
        </div>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
              Portfolio intelligence report
            </span>
            <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground)/0.8)]">{reportAt ?? '—'}</span>
          </div>

          {/* DNA score ring */}
          <div className="flex flex-col items-center">
            <div className="relative flex h-[140px] w-[140px] items-center justify-center">
              <svg width="140" height="140" viewBox="0 0 140 140" className="absolute inset-0">
                <circle cx="70" cy="70" r="58" fill="none" stroke="#1E293B" strokeWidth="12" />
                <circle
                  cx="70"
                  cy="70"
                  r="58"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - displayScore / 100)}
                  transform="rotate(-90 70 70)"
                  className="transition-[stroke-dashoffset] duration-700"
                />
              </svg>
              <div className="relative z-10 flex flex-col items-center">
                <motion.span className="font-finance text-4xl font-bold tabular-nums text-[hsl(var(--foreground))]">
                  {displayScore}
                </motion.span>
                <span className="text-sm text-[hsl(var(--muted-foreground))]">/100</span>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] font-mono tracking-widest text-[hsl(var(--muted-foreground))]">
              Portfolio DNA score
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">{result.investor_type}</p>
              <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">Investor profile</p>
            </div>
            <div className="flex items-start justify-end">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-mono font-medium ${
                  riskLevel === 'Low'
                    ? 'border-positive/30 bg-positive/10 text-positive'
                    : riskLevel === 'Moderate'
                      ? 'border-warning/30 bg-warning/10 text-warning'
                      : 'border-risk/30 bg-risk/10 text-risk'
                }`}
              >
                Risk: {riskLevel}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {metricEntries.map((m) => (
              <KPICard key={m.label} title={m.label} value={m.value} compact />
            ))}
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-[hsl(var(--accent))]" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                AI insights
              </span>
            </div>
            <div className="space-y-2">
              {insightItems.map((rec, i) => (
                <div
                  key={i}
                  className="rounded-r-lg border border-[hsl(var(--border))] border-l-2 border-l-[hsl(var(--accent)/0.5)] bg-surface-2 p-3 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]"
                >
                  {rec}
                </div>
              ))}
            </div>
          </div>

          {!!result.positions?.length && (
            <div className="relative overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[11px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="px-4 py-3 text-left">Symbol</th>
                    <th className="px-4 py-3 text-right">Shares</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {result.positions.slice(0, 10).map((p) => (
                    <tr key={p.symbol} className="border-b border-[hsl(var(--border)/0.4)] hover:bg-[hsl(var(--surface-2)/0.5)]">
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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => localStorage.setItem('neufin-last-analysis', JSON.stringify(result))}
              className="rounded-lg border border-[hsl(var(--border))] bg-transparent px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]"
            >
              Save Analysis
            </button>
            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={downloadLoading || !portfolioId}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                isAdvisorPlan
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'bg-warning text-[hsl(var(--warning-foreground))]'
              }`}
            >
              {downloadLoading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Preparing report...
                </>
              ) : isAdvisorPlan ? (
                'Download PDF'
              ) : (
                'Get Full Report — $49'
              )}
            </button>
            {!isAdvisorPlan && (
              <Link
                href="/pricing"
                className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm text-[hsl(var(--primary))]"
              >
                Advisor report available on Pro plan
              </Link>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
