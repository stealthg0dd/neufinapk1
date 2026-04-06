'use client'

import { useState } from 'react'
import Link from 'next/link'

const BASE = 'https://neufin-backend-production.up.railway.app'

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
  const [activeTab, setActiveTab] = useState<'curl' | 'python' | 'javascript'>('curl')

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 sticky top-0 z-10 bg-gray-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-bold">NeuFin</Link>
            <span className="text-gray-700">/</span>
            <Link href="/developer" className="text-gray-400 hover:text-gray-100 text-sm">API</Link>
            <span className="text-gray-700">/</span>
            <span className="text-sm text-gray-200">Docs</span>
          </div>
          <Link href="/developer/keys" className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500">
            My API Keys
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-14">

        <div>
          <h1 className="text-3xl font-bold mb-2">API Reference</h1>
          <p className="text-gray-400">
            Base URL: <code className="text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded">{BASE}</code>
          </p>
        </div>

        {/* Code examples */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Example: Semantic Research Query</h2>
          <div className="rounded-2xl border border-gray-800 overflow-hidden">
            <div className="bg-gray-900 border-b border-gray-800 flex">
              {(['curl', 'python', 'javascript'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setActiveTab(lang)}
                  className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === lang
                      ? 'bg-gray-800 text-gray-100 border-b-2 border-blue-500'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
            <pre className="p-6 text-sm font-mono text-gray-300 overflow-x-auto leading-relaxed">
              {CODE_EXAMPLES[activeTab]}
            </pre>
          </div>
        </section>

        {/* Endpoints */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Endpoints</h2>
          <div className="space-y-3">
            {ENDPOINTS.map((ep) => (
              <details key={ep.path} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden group">
                <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-800/50 transition-colors list-none">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold font-mono flex-shrink-0 ${METHOD_COLORS[ep.method]}`}>
                    {ep.method}
                  </span>
                  <code className="text-sm font-mono text-gray-200 flex-1">{ep.path}</code>
                  <span className="text-xs text-gray-500 truncate hidden sm:block max-w-xs">{ep.summary}</span>
                  {ep.plan && (
                    <span className="rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 text-xs flex-shrink-0">
                      {ep.plan}
                    </span>
                  )}
                </summary>
                <div className="px-5 pb-5 pt-2 space-y-3 border-t border-gray-800">
                  <p className="text-sm text-gray-400">{ep.summary}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Auth:</span>
                    <code className="text-xs font-mono text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded">
                      {ep.auth === 'api_key' ? 'X-NeuFin-API-Key header' : ep.auth === 'bearer' ? 'Bearer token' : 'None'}
                    </code>
                  </div>
                  {ep.request && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">Request body</p>
                      <pre className="rounded-lg bg-gray-950 border border-gray-800 px-4 py-3 text-xs font-mono text-gray-300 overflow-x-auto">
                        {ep.request}
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Response</p>
                    <pre className="rounded-lg bg-gray-950 border border-gray-800 px-4 py-3 text-xs font-mono text-gray-300 overflow-x-auto">
                      {ep.response}
                    </pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Error codes */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Error Codes</h2>
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            {[
              { code: '200', desc: 'Success' },
              { code: '400', desc: 'Bad request — check request body' },
              { code: '401', desc: 'Missing or invalid API key' },
              { code: '402', desc: 'Usage limit reached — upgrade plan' },
              { code: '403', desc: 'Insufficient plan for this endpoint' },
              { code: '429', desc: 'Rate limit exceeded (10,000 req/day)' },
              { code: '500', desc: 'Internal server error — contact support' },
            ].map((e, i) => (
              <div key={e.code} className={`flex items-center gap-4 px-5 py-3 text-sm ${i % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900/50'}`}>
                <code className={`font-mono font-bold w-12 ${e.code.startsWith('2') ? 'text-emerald-400' : e.code.startsWith('4') ? 'text-yellow-400' : 'text-red-400'}`}>
                  {e.code}
                </code>
                <span className="text-gray-400">{e.desc}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
