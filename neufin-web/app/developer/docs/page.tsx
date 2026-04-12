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
  POST: 'bg-blue-500/20 text-blue-400',
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
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="sticky top-0 z-10 border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/developer" className="text-gray-400 hover:text-gray-100 text-sm">Developer</Link>
            <span className="text-gray-700">/</span>
            <span className="text-sm text-gray-200">Docs</span>
          </div>
          <Link href="/developer/keys" className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500">
            My API Keys
          </Link>
        </div>
      </nav>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <h1 className="text-3xl font-bold">NeuFin API documentation</h1>
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-lg font-semibold">1) Authentication</h2>
          <p className="mt-2 text-sm text-gray-400">Base URL: <code>{'https://neufin101-production.up.railway.app'}</code></p>
          <p className="text-sm text-gray-400">Auth: Bearer token in Authorization header.</p>
          <p className="text-sm text-gray-400">Getting started: create account → Developer → copy API key.</p>
          <pre className="mt-2 rounded-lg border border-gray-800 bg-black/40 p-3 text-xs">Authorization: Bearer nf_live_sk_xxxxxxxxxxxx</pre>
        </section>
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-lg font-semibold">2) POST /api/swarm/analyze</h2>
          <p className="text-sm text-gray-400">Submit a portfolio for 7-agent IC analysis. Returns immediately with job_id. Poll /status/{'{job_id}'} for progress.</p>
          <pre className="mt-2 rounded-lg border border-gray-800 bg-black/40 p-3 text-xs">{`{
  "positions": [
    {"symbol": "AAPL", "shares": 100, "cost_basis": 150.00},
    {"symbol": "NVDA", "shares": 50, "cost_basis": 400.00}
  ],
  "total_value": 35000
}`}</pre>
          <pre className="mt-2 rounded-lg border border-gray-800 bg-black/40 p-3 text-xs">{`{
  "job_id": "8f2a4b1c-...",
  "status": "queued",
  "poll_url": "/api/swarm/status/8f2a4b1c-...",
  "estimated_seconds": 75
}`}</pre>
        </section>
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-lg font-semibold">3) GET /api/swarm/status/{'{job_id}'}</h2>
          <p className="text-sm text-gray-400">Poll every 3s to track agent progress and get results.</p>
          <pre className="mt-2 rounded-lg border border-gray-800 bg-black/40 p-3 text-xs">{`{
  "job_id": "8f2a4b1c-...",
  "status": "running",
  "progress_pct": 57,
  "agent_trace": [
    {"agent": "risk_agent", "status": "complete", "summary": "..."},
    {"agent": "sector_agent", "status": "running", "summary": "..."}
  ]
}`}</pre>
        </section>
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-lg font-semibold">4) GET /api/swarm/result/{'{job_id}'}</h2>
          <p className="text-sm text-gray-400">Fetch full IC briefing when status == complete.</p>
          <pre className="mt-2 rounded-lg border border-gray-800 bg-black/40 p-3 text-xs">{`{
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
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-lg font-semibold">5) GET /api/research/regime</h2>
          <p className="text-sm text-gray-400">Get current macro regime classification.</p>
          <pre className="mt-2 rounded-lg border border-gray-800 bg-black/40 p-3 text-xs">{`{
  "regime": "risk_off",
  "confidence": 0.82,
  "signals": ["vix_elevated", "yield_curve_inverted"],
  "narrative": "...",
  "updated_at": "2026-04-10T08:00:00Z"
}`}</pre>
        </section>
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <h2 className="text-lg font-semibold">6) GET /api/portfolio/chart/{'{ticker}'}</h2>
          <p className="text-sm text-gray-400">OHLCV chart data for candlestick rendering.</p>
          <p className="text-sm text-gray-400">Params: period = 1mo | 3mo | 6mo | 1y | 3y</p>
          <pre className="mt-2 rounded-lg border border-gray-800 bg-black/40 p-3 text-xs">[{`{"date":"2026-04-01","open":181.2,"high":184.3,"low":179.5,"close":183.7,"volume":61439200}`}]
          </pre>
        </section>
        <section className="rounded-xl border border-gray-700 bg-black/40 p-4">
          <h2 className="mb-3 text-lg font-semibold">Sandbox</h2>
          <div className="mb-3">
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="nf_live_sk_..." className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <select value={endpoint} onChange={(e) => setEndpoint(e.target.value as 'swarm' | 'regime' | 'chart')} className="mb-2 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm">
                <option value="swarm">POST /api/swarm/analyze</option>
                <option value="regime">GET /api/research/regime</option>
                <option value="chart">GET /api/portfolio/chart/{'{ticker}'}</option>
              </select>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="w-full rounded border border-gray-700 bg-black/50 p-3 font-mono text-xs" />
              <div className="mt-2 flex gap-2">
                <button onClick={() => void sendRequest()} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold">Send Request →</button>
                <button onClick={() => void navigator.clipboard.writeText(curl)} className="rounded border border-gray-700 px-4 py-2 text-sm">Copy as curl</button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-gray-400">HTTP {status ?? '—'} · {elapsedMs ?? '—'} ms</p>
              <pre className="max-h-[320px] overflow-auto rounded border border-gray-800 bg-black/50 p-3 text-xs">{JSON.stringify(response, null, 2)}</pre>
              {agentTrace.length > 0 && <pre className="mt-2 max-h-[200px] overflow-auto rounded border border-gray-800 bg-black/50 p-3 text-xs">{JSON.stringify(agentTrace, null, 2)}</pre>}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
