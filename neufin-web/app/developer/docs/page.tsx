'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

const BASE_URL = 'https://neufin101-production.up.railway.app'
const BASE = BASE_URL

interface Endpoint {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH'
  path: string
  summary: string
  auth: 'none' | 'bearer' | 'api_key'
  plan?: string
  request?: string
  response: string
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET', path: '/api/research/regime',
    summary: 'Get current market regime (risk-on, risk-off, stagflation, recovery, recession_risk)',
    auth: 'api_key', plan: 'enterprise',
    response: '{ "regime": "risk_on", "confidence": 0.82, "started_at": "2026-03-15T00:00:00Z", "supporting_signals": {...} }',
  },
  {
    method: 'GET', path: '/api/research/notes',
    summary: 'List latest AI-generated research notes (paginated)',
    auth: 'api_key', plan: 'enterprise',
    response: '{ "notes": [ { "id": "...", "title": "...", "executive_summary": "...", "generated_at": "..." } ] }',
  },
  {
    method: 'POST', path: '/api/research/query',
    summary: 'Semantic search across research knowledge base using natural language',
    auth: 'api_key', plan: 'enterprise',
    request: '{ "query": "impact of Fed rate cuts on Singapore REITs", "limit": 5 }',
    response: '{ "results": [ { "type": "note|signal|event", "title": "...", "similarity": 0.91, "summary": "..." } ] }',
  },
  {
    method: 'GET', path: '/api/research/signals',
    summary: 'Latest macro signals (interest rates, inflation, GDP) with significance scores',
    auth: 'api_key', plan: 'enterprise',
    response: '{ "signals": [ { "signal_type": "interest_rate", "region": "US", "value": 5.25, "significance": "high" } ] }',
  },
  {
    method: 'POST', path: '/api/analyze-dna',
    summary: 'Upload portfolio CSV and receive behavioral DNA analysis',
    auth: 'api_key', plan: 'enterprise',
    request: 'multipart/form-data: file (CSV), portfolio_name (optional)',
    response: '{ "dna_score": 78, "investor_type": "Balanced Trader", "bias_scores": { "disposition_effect": 0.72 }, "market_context": { "regime": "risk_on" } }',
  },
  {
    method: 'GET', path: '/api/plans',
    summary: 'List all subscription plans and their features',
    auth: 'none',
    response: '{ "free": {...}, "retail": {...}, "advisor": {...}, "enterprise": {...} }',
  },
]

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/20 text-emerald-400',
  POST: 'bg-primary/20 text-primary',
  DELETE: 'bg-red-500/20 text-red-400',
  PATCH: 'bg-yellow-500/20 text-yellow-400',
}

const CODE_EXAMPLES: Record<string, string> = {
  curl: `curl -X POST \\
  "${BASE}/api/research/query" \\
  -H "X-NeuFin-API-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "Fed rate impact on Singapore REITs", "limit": 5}'`,

  python: `import requests

API_KEY = "YOUR_KEY"
BASE_URL = "${BASE}"

response = requests.post(
    f"{BASE_URL}/api/research/query",
    headers={"X-NeuFin-API-Key": API_KEY},
    json={"query": "Fed rate impact on Singapore REITs", "limit": 5}
)

data = response.json()
for result in data["results"]:
    print(f"{result['title']} — similarity: {result['similarity']:.2f}")`,

  javascript: `const API_KEY = "YOUR_KEY";
const BASE_URL = "${BASE}";

const response = await fetch(\`\${BASE_URL}/api/research/query\`, {
  method: "POST",
  headers: {
    "X-NeuFin-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: "Fed rate impact on Singapore REITs",
    limit: 5,
  }),
});

const data = await response.json();
console.log(data.results);`,
}

export default function DeveloperDocsPage() {
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState<'swarm' | 'regime' | 'chart'>('regime')
  const [body, setBody] = useState('{}')
  const [status, setStatus] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [response, setResponse] = useState<unknown>({ message: 'Send a request to start.' })
  const [agentTrace, setAgentTrace] = useState<unknown[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const k = localStorage.getItem('neufin-api-key') || ''
    if (k) setApiKey(k)
  }, [])

  useEffect(() => {
    if (endpoint === 'swarm') {
      setBody(
        JSON.stringify(
          {
            positions: [
              { symbol: 'AAPL', shares: 180, cost_basis: 150 },
              { symbol: 'NVDA', shares: 60, cost_basis: 410 },
              { symbol: 'MSFT', shares: 70, cost_basis: 320 },
            ],
            total_value: 100000,
          },
          null,
          2,
        ),
      )
      return
    }
    if (endpoint === 'chart') {
      setBody(JSON.stringify({ ticker: 'AAPL', period: '3mo' }, null, 2))
      return
    }
    setBody('{}')
  }, [endpoint])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const curl = useMemo(() => {
    const k = apiKey || 'nf_live_sk_xxxxxxxxxxxx'
    if (endpoint === 'swarm') {
      return `curl -X POST "${BASE_URL}/api/swarm/analyze" \\
  -H "Authorization: Bearer ${k}" \\
  -H "X-NeuFin-API-Key: ${k}" \\
  -H "Content-Type: application/json" \\
  -d '${body.replace(/\n/g, ' ')}'`
    }
    if (endpoint === 'chart') {
      let ticker = 'AAPL'
      let period = '3mo'
      try {
        const parsed = JSON.parse(body) as { ticker?: string; period?: string }
        ticker = (parsed.ticker || 'AAPL').toUpperCase()
        period = parsed.period || '3mo'
      } catch {}
      return `curl "${BASE_URL}/api/portfolio/chart/${ticker}?period=${period}" \\
  -H "Authorization: Bearer ${k}" \\
  -H "X-NeuFin-API-Key: ${k}"`
    }
    return `curl "${BASE_URL}/api/research/regime" \\
  -H "Authorization: Bearer ${k}" \\
  -H "X-NeuFin-API-Key: ${k}"`
  }, [apiKey, body, endpoint])

  const sendRequest = async () => {
    if (!apiKey.trim()) {
      setResponse({ error: 'Add your API key from /developer/keys first.' })
      setStatus(null)
      setElapsedMs(null)
      return
    }
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    const started = performance.now()
    let url = `${BASE_URL}/api/research/regime`
    let method: 'GET' | 'POST' = 'GET'
    let payload: string | undefined
    if (endpoint === 'swarm') {
      method = 'POST'
      url = `${BASE_URL}/api/swarm/analyze`
      payload = body
    } else if (endpoint === 'chart') {
      const parsed = JSON.parse(body || '{}') as { ticker?: string; period?: string }
      const ticker = (parsed.ticker || 'AAPL').toUpperCase()
      const period = parsed.period || '3mo'
      url = `${BASE_URL}/api/portfolio/chart/${encodeURIComponent(ticker)}?period=${encodeURIComponent(period)}`
    }
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-NeuFin-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: payload,
      })
      const text = await res.text()
      const elapsed = Math.round(performance.now() - started)
      let parsed: unknown = {}
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { raw: text }
      }
      setStatus(res.status)
      setElapsedMs(elapsed)
      setResponse(parsed)
      setAgentTrace([])
      if (endpoint === 'swarm' && res.ok) {
        const jobId = (parsed as { job_id?: string }).job_id
        if (jobId) {
          pollRef.current = setInterval(async () => {
            try {
              const pollRes = await fetch(`${BASE_URL}/api/swarm/status/${jobId}`, {
                headers: { Authorization: `Bearer ${apiKey}`, 'X-NeuFin-API-Key': apiKey },
              })
              const pollJson = (await pollRes.json()) as { status?: string; agent_trace?: unknown[] }
              if (Array.isArray(pollJson.agent_trace)) setAgentTrace(pollJson.agent_trace)
              setResponse((prev) => ({ ...(prev as Record<string, unknown>), latest_status: pollJson }))
              if (pollJson.status === 'complete' || pollJson.status === 'failed') {
                if (pollRef.current) clearInterval(pollRef.current)
                pollRef.current = null
              }
            } catch {
              if (pollRef.current) clearInterval(pollRef.current)
              pollRef.current = null
            }
          }, 3000)
        }
      }
    } catch (err) {
      setStatus(0)
      setElapsedMs(Math.round(performance.now() - started))
      setResponse({ error: err instanceof Error ? err.message : 'Request failed' })
    }
  }

  return (
    <div className="min-h-screen bg-app text-navy">
      <nav className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/developer" className="text-sm text-muted2 transition-colors hover:text-navy">
              Developer
            </Link>
            <span className="text-border">/</span>
            <span className="text-sm font-medium text-navy">Docs</span>
          </div>
          <Link
            href="/developer/keys"
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-slate2 transition-colors hover:border-primary hover:text-primary-dark"
          >
            My API Keys
          </Link>
        </div>
      </nav>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-section">
        <h1 className="text-3xl font-bold text-navy">NeuFin API documentation</h1>
        <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">1) Authentication</h2>
          <p className="mt-2 text-sm text-slate2">
            Base URL: <code className="rounded bg-surface-2 px-1 font-mono text-sm">{'https://neufin101-production.up.railway.app'}</code>
          </p>
          <p className="text-sm text-slate2">Auth: Bearer token in Authorization header.</p>
          <p className="text-sm text-slate2">Getting started: create account → Developer → copy API key.</p>
          <pre className="mt-2 rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-slate2">
            Authorization: Bearer nf_live_sk_xxxxxxxxxxxx
          </pre>
        </section>
        <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">2) POST /api/swarm/analyze</h2>
          <p className="text-sm text-slate2">
            Submit a portfolio for 7-agent IC analysis. Returns immediately with job_id. Poll /status/{'{job_id}'} for
            progress.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-slate2">{`{
  "positions": [
    {"symbol": "AAPL", "shares": 100, "cost_basis": 150.00},
    {"symbol": "NVDA", "shares": 50, "cost_basis": 400.00}
  ],
  "total_value": 35000
}`}</pre>
          <pre className="mt-2 rounded-lg border border-shell-border bg-black/40 p-3 text-xs">{`{
  "job_id": "8f2a4b1c-...",
  "status": "queued",
  "poll_url": "/api/swarm/status/8f2a4b1c-...",
  "estimated_seconds": 75
}`}</pre>
        </section>
        <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">3) GET /api/swarm/status/{'{job_id}'}</h2>
          <p className="text-sm text-slate2">Poll every 3s to track agent progress and get results.</p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-slate2">{`{
  "job_id": "8f2a4b1c-...",
  "status": "running",
  "progress_pct": 57,
  "agent_trace": [
    {"agent": "risk_agent", "status": "complete", "summary": "..."},
    {"agent": "sector_agent", "status": "running", "summary": "..."}
  ]
}`}</pre>
        </section>
        <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">4) GET /api/swarm/result/{'{job_id}'}</h2>
          <p className="text-sm text-slate2">Fetch full IC briefing when status == complete.</p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-slate2">{`{
  "ic_briefing": {
    "portfolio_analyst": {...},
    "macro_strategist": {...},
    "risk_manager": {...},
    "sector_specialist": {...},
    "factor_quant": {...},
    "behavioral_agent": {...},
    "synthesis_agent": {...}
  }
}`}</pre>
        </section>
        <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">5) GET /api/research/regime</h2>
          <p className="text-sm text-slate2">Get current macro regime classification.</p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-slate2">{`{
  "regime": "risk_off",
  "confidence": 0.82,
  "signals": ["vix_elevated", "yield_curve_inverted"],
  "narrative": "...",
  "updated_at": "2026-04-10T08:00:00Z"
}`}</pre>
        </section>
        <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">6) GET /api/portfolio/chart/{'{ticker}'}</h2>
          <p className="text-sm text-slate2">OHLCV chart data for candlestick rendering.</p>
          <p className="text-sm text-slate2">Params: period = 1mo | 3mo | 6mo | 1y | 3y</p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-slate2">
            [{`{"date":"2026-04-01","open":181.2,"high":184.3,"low":179.5,"close":183.7,"volume":61439200}`}]
          </pre>
        </section>
        <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-navy">Sandbox</h2>
          <div className="mb-3">
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="nf_live_sk_..."
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy placeholder:text-muted2"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <select
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value as 'swarm' | 'regime' | 'chart')}
                className="mb-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
              >
                <option value="swarm">POST /api/swarm/analyze</option>
                <option value="regime">GET /api/research/regime</option>
                <option value="chart">GET /api/portfolio/chart/{'{ticker}'}</option>
              </select>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="w-full rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-slate2"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void sendRequest()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  Send Request →
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(curl)}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-slate2 hover:border-primary hover:text-primary-dark"
                >
                  Copy as curl
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-muted2">
                HTTP {status ?? '—'} · {elapsedMs ?? '—'} ms
              </p>
              <pre className="max-h-[320px] overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-slate2">
                {JSON.stringify(response, null, 2)}
              </pre>
              {agentTrace.length > 0 && (
                <pre className="mt-2 max-h-[200px] overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm text-slate2">
                  {JSON.stringify(agentTrace, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
