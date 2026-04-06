'use client'

import Link from 'next/link'

const BASE_URL = 'https://neufin-backend-production.up.railway.app'

export default function DeveloperPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 sticky top-0 z-10 bg-gray-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold">NeuFin</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/developer/docs" className="text-gray-400 hover:text-gray-100">API Docs</Link>
            <Link href="/developer/keys" className="text-gray-400 hover:text-gray-100">My Keys</Link>
            <Link href="/pricing" className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-1.5 text-sm font-medium text-white transition-colors">
              Get API Access
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16 space-y-20">

        {/* Hero */}
        <div className="text-center space-y-6">
          <span className="inline-block rounded-full bg-blue-500/10 border border-blue-500/20 px-4 py-1 text-sm text-blue-400 font-medium">
            Enterprise API
          </span>
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight">
            NeuFin API Platform
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Embed institutional-grade behavioral finance intelligence into your application.
            10,000 API calls/day. Production-ready. MAS-aligned.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/developer/docs" className="rounded-xl bg-blue-600 hover:bg-blue-500 px-8 py-3 text-base font-semibold text-white transition-colors">
              Read the Docs
            </Link>
            <Link href="/contact-sales" className="rounded-xl border border-gray-700 hover:border-gray-500 px-8 py-3 text-base font-medium text-gray-300 transition-colors">
              Contact Sales
            </Link>
          </div>
        </div>

        {/* Quick start */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Quick Start</h2>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-800 px-6 py-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/60" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <span className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="ml-3 text-xs text-gray-500 font-mono">curl</span>
            </div>
            <pre className="p-6 text-sm font-mono text-gray-300 overflow-x-auto leading-relaxed">
{`curl -X GET \\
  "${BASE_URL}/api/research/regime" \\
  -H "X-NeuFin-API-Key: YOUR_API_KEY"`}
            </pre>
          </div>
          <p className="text-sm text-gray-500">
            The market regime endpoint is free to explore. Full access (DNA analysis, swarm, research query) requires an Enterprise plan.
          </p>
        </section>

        {/* Capabilities */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">What You Can Build</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: "🧬",
                title: "Portfolio DNA Analysis",
                desc: "Upload client portfolio CSV and get a behavioral bias score — disposition effect, recency bias, home bias, and more.",
                endpoint: "POST /api/analyze-dna",
              },
              {
                icon: "🐝",
                title: "Swarm Intelligence",
                desc: "Multi-agent AI analysis of portfolio risk, opportunities, and sector allocation with market context.",
                endpoint: "POST /api/swarm",
              },
              {
                icon: "📡",
                title: "Research Intelligence",
                desc: "Semantic search across macro signals and AI-generated research notes. Ask questions in natural language.",
                endpoint: "POST /api/research/query",
              },
              {
                icon: "🌍",
                title: "Market Regime",
                desc: "Current macro market regime classification (risk-on/off, stagflation, recovery) with confidence score.",
                endpoint: "GET /api/research/regime",
              },
              {
                icon: "📊",
                title: "Macro Signals",
                desc: "Real-time feed of interest rates, inflation, GDP data from Fed, MAS, World Bank with significance scores.",
                endpoint: "GET /api/research/signals",
              },
              {
                icon: "📄",
                title: "White-Label Reports",
                desc: "Generate branded PDF research reports for your clients with your logo and colour scheme.",
                endpoint: "POST /api/reports/generate",
              },
            ].map((cap) => (
              <div key={cap.title} className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
                <span className="text-3xl">{cap.icon}</span>
                <h3 className="font-bold text-gray-100">{cap.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{cap.desc}</p>
                <code className="block text-xs text-blue-400 font-mono bg-blue-500/5 border border-blue-500/10 rounded px-2 py-1">
                  {cap.endpoint}
                </code>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-8 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold">Enterprise API Access</h2>
              <p className="text-gray-400 mt-1">10,000 API calls/day · All endpoints · Dedicated support</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">$999<span className="text-lg font-normal text-gray-400">/mo</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Custom pricing for higher volumes</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/pricing" className="rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors">
              Start Free Trial
            </Link>
            <Link href="/contact-sales" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
              Contact Sales for custom volume →
            </Link>
          </div>
        </section>

        {/* Base URL / Auth */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Authentication</h2>
          <p className="text-gray-400">
            All API requests must include your API key in the <code className="text-blue-400 bg-blue-500/10 px-1 rounded">X-NeuFin-API-Key</code> header.
            Generate keys from the <Link href="/developer/keys" className="text-blue-400 hover:underline">keys dashboard</Link>.
          </p>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Base URL</span>
              <code className="text-sm font-mono text-emerald-400">{BASE_URL}</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Auth Header</span>
              <code className="text-sm font-mono text-emerald-400">X-NeuFin-API-Key: &lt;key&gt;</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Rate Limit</span>
              <code className="text-sm font-mono text-emerald-400">10,000 req/day</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Response format</span>
              <code className="text-sm font-mono text-emerald-400">application/json</code>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
