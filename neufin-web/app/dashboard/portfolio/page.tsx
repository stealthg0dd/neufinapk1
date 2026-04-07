'use client'

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { analyzeDNA, type DNAAnalysisResponse } from '@/lib/api'

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
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [result, setResult] = useState<DNAAnalysisResponse | null>(null)
  const scoreSpring = useSpring(0, { stiffness: 120, damping: 24 })
  const scoreLabel = useTransform(scoreSpring, (v) => Math.round(v))

  const fileSize = useMemo(() => (file ? `${(file.size / 1024).toFixed(1)} KB` : ''), [file])

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
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const data = await analyzeDNA(file, session?.access_token ?? null)
      setResult(data)
      scoreSpring.set(data.dna_score)
      localStorage.setItem('neufin-last-analysis', JSON.stringify(data))
      setProgress(100)
    } finally {
      window.clearInterval(timer)
      setBusy(false)
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
        className={`backdrop-blur-xl bg-white/5 border rounded-2xl p-10 text-center cursor-pointer transition-colors ${
          dragging ? 'border-[var(--amber)]' : 'border-[var(--amber)]/50 border-dashed'
        }`}
      >
        <input ref={inputRef} type="file" accept=".csv" onChange={onPick} className="hidden" />
        <p className="text-3xl text-[var(--amber)] mb-3">↑</p>
        <p className="text-lg font-semibold">Drop your portfolio CSV here</p>
        <p className="text-sm text-[var(--text-2)] mt-1">or click to browse (CSV, max 10MB)</p>
      </div>

      {file && (
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4">
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
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
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
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
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
                <motion.p className="font-mono text-5xl text-[var(--amber)]">{scoreLabel}</motion.p>
                <span className="text-xs px-2 py-1 rounded-full bg-white/10">
                  {result.investor_type || 'Risk Profile'}
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
                <div key={i} className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 border-l-4 border-l-[var(--amber)]">
                  <p className="text-sm text-[var(--text)]">{rec}</p>
                </div>
              ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => localStorage.setItem('neufin-last-analysis', JSON.stringify(result))}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/10"
            >
              Save to Dashboard
            </button>
            <Link href="/pricing" className="px-4 py-2 rounded-lg border border-[var(--amber)] text-[var(--amber)]">
              Advisor report available on Pro plan
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4">
      <p className="text-xs text-[var(--text-2)]">{label}</p>
      <p className="font-mono text-lg mt-1">{value}</p>
    </div>
  )
}

