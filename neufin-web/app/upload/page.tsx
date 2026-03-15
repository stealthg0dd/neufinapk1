'use client'

import { Suspense, useState, useRef, DragEvent, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { analyzeDNA } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useAnalytics } from '@/lib/posthog'
import RefCapture from '@/components/RefCapture'
import { trackEvent, EVENTS } from '@/components/Analytics'

const SAMPLE_CSV = `symbol,shares,cost_basis
AAPL,10,145.50
MSFT,5,280.00
GOOGL,3,130.00
NVDA,8,420.00
JPM,12,155.00
`

export default function UploadPage() {
  const router = useRouter()
  const { token } = useAuth()
  const { track } = useAnalytics()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.csv')) setFile(dropped)
    else setError('Please upload a .csv file')
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) { setFile(selected); setError('') }
  }

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample-portfolio.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSubmit = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    track('csv_upload_started', { filename: file.name, size_kb: Math.round(file.size / 1024) })
    trackEvent(EVENTS.UPLOAD_STARTED, { size_kb: Math.round(file.size / 1024) })
    try {
      const result = await analyzeDNA(file, token)
      localStorage.setItem('dnaResult', JSON.stringify(result))
      track('dna_analysis_complete', {
        dna_score:     result.dna_score,
        investor_type: result.investor_type,
        num_positions: result.num_positions,
      })
      router.push('/results')
    } catch (e: unknown) {
      track('csv_upload_error', { error: e instanceof Error ? e.message : 'unknown' })
      setError(e instanceof Error ? e.message : 'Analysis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
            <span className="text-xl font-bold text-gradient">Neufin</span>
          </div>
        </nav>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-xl space-y-5">
            {/* Status header */}
            <div className="text-center space-y-2 mb-8">
              <div className="inline-flex items-center gap-2 text-blue-400 text-sm font-medium">
                <span className="inline-block w-3.5 h-3.5 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
                AI is analyzing your portfolio…
              </div>
              <p className="text-xs text-gray-600">This usually takes 5–10 seconds</p>
            </div>

            {/* Shimmer skeleton cards */}
            <div className="card space-y-3">
              <div className="shimmer h-3 w-1/3 rounded" />
              <div className="shimmer h-8 w-2/3 rounded" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card space-y-2">
                  <div className="shimmer h-2.5 w-3/4 rounded" />
                  <div className="shimmer h-6 w-full rounded" />
                </div>
              ))}
            </div>

            <div className="card space-y-2.5">
              <div className="shimmer h-2.5 w-1/4 rounded" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 items-center">
                  <div className="shimmer h-4 w-4 rounded-full shrink-0" />
                  <div className="shimmer h-3 flex-1 rounded" />
                </div>
              ))}
            </div>

            <div className="card space-y-2">
              <div className="shimmer h-2.5 w-1/3 rounded" />
              <div className="shimmer h-3 w-full rounded" />
              <div className="shimmer h-3 w-5/6 rounded" />
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Suspense fallback={null}><RefCapture /></Suspense>
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm">← Back</Link>
          <span className="text-xl font-bold text-gradient">Neufin</span>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <h1 className="text-3xl font-bold mb-2">Upload your portfolio</h1>
          <p className="text-gray-400 mb-8">CSV with columns: <code className="text-blue-400">symbol</code>, <code className="text-blue-400">shares</code>, and optional <code className="text-blue-400">cost_basis</code></p>

          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200
              ${dragging ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-gray-500 hover:bg-gray-900/50'}
              ${file ? 'border-green-600/60 bg-green-500/5' : ''}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={handleChange}
              className="hidden"
            />
            {file ? (
              <>
                <div className="text-4xl mb-3">✅</div>
                <p className="font-semibold text-green-400">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Ready to analyze</p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">📂</div>
                <p className="font-semibold text-gray-300">Drop your CSV here</p>
                <p className="text-sm text-gray-500 mt-1">or click to browse</p>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={handleSubmit}
              disabled={!file || loading}
              className={`btn-primary w-full text-base py-4 flex items-center justify-center gap-2
                ${(!file || loading) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Analyze My Portfolio →
            </button>

            <button
              onClick={downloadSample}
              className="btn-outline w-full text-sm py-3"
            >
              Download sample CSV
            </button>
          </div>

          {/* Format hint */}
          <div className="mt-6 card text-sm">
            <p className="text-gray-400 font-medium mb-2">Expected CSV format:</p>
            <pre className="text-xs text-gray-500 font-mono leading-relaxed">{SAMPLE_CSV.trim()}</pre>
          </div>
        </div>
      </main>
    </div>
  )
}
