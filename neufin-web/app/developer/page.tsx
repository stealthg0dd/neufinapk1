'use client'

import Link from 'next/link'
import { Dna, Bot, BookOpen, Globe, Activity, FileChartColumn } from 'lucide-react'

const BASE_URL = 'https://neufin-backend-production.up.railway.app'

const CAPABILITIES = [
  {
    Icon: Dna,
    title: 'Portfolio DNA Analysis',
    desc: 'Upload client portfolio CSV and get a behavioral bias score — disposition effect, recency bias, home bias, and more.',
    endpoint: 'POST /api/analyze-dna',
  },
  {
    Icon: Bot,
    title: 'Swarm Intelligence',
    desc: 'Multi-agent AI analysis of portfolio risk, opportunities, and sector allocation with market context.',
    endpoint: 'POST /api/swarm',
  },
  {
    Icon: BookOpen,
    title: 'Research Intelligence',
    desc: 'Semantic search across macro signals and AI-generated research notes. Ask questions in natural language.',
    endpoint: 'POST /api/research/query',
  },
  {
    Icon: Globe,
    title: 'Market Regime',
    desc: 'Current macro market regime classification (risk-on/off, stagflation, recovery) with confidence score.',
    endpoint: 'GET /api/research/regime',
  },
  {
    Icon: Activity,
    title: 'Macro Signals',
    desc: 'Real-time feed of interest rates, inflation, GDP data from Fed, MAS, World Bank with significance scores.',
    endpoint: 'GET /api/research/signals',
  },
  {
    Icon: FileChartColumn,
    title: 'White-Label Reports',
    desc: 'Generate branded PDF research reports for your clients with your logo and colour scheme.',
    endpoint: 'POST /api/reports/generate',
  },
] as const

export default function DeveloperPage() {
  return (
    <div className="min-h-screen bg-app text-navy">
      <nav className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-navy">
            NeuFin
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/developer/docs" className="text-muted2 transition-colors hover:text-navy">
              API Docs
            </Link>
            <Link href="/developer/keys" className="text-muted2 transition-colors hover:text-navy">
              My Keys
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Get API Access
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl space-y-20 px-6 py-section">
        <div className="space-y-6 text-center">
          <span className="inline-block rounded-full border border-primary/25 bg-primary-light px-4 py-1 text-sm font-medium text-primary-dark">
            Enterprise API
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">NeuFin API Platform</h1>
          <p className="mx-auto max-w-2xl text-xl leading-relaxed text-slate2">
            Embed institutional-grade behavioral finance intelligence into your application. 10,000 API calls/day.
            Production-ready. MAS-aligned.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/developer/docs"
              className="rounded-xl bg-primary px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Read the Docs
            </Link>
            <Link
              href="/contact-sales"
              className="rounded-xl border border-border px-8 py-3 text-base font-medium text-slate2 transition-colors hover:border-primary hover:text-primary-dark"
            >
              Contact Sales
            </Link>
          </div>
        </div>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-navy">Quick Start</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-border-light bg-surface-2 px-6 py-3">
              <span className="h-3 w-3 rounded-full bg-red-400/80" />
              <span className="h-3 w-3 rounded-full bg-amber-400/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
              <span className="ml-3 font-mono text-xs text-muted2">curl</span>
            </div>
            <pre className="overflow-x-auto p-6 font-mono text-sm leading-relaxed text-slate2">
              {`curl -X GET \\
  "${BASE_URL}/api/research/regime" \\
  -H "X-NeuFin-API-Key: YOUR_API_KEY"`}
            </pre>
          </div>
          <p className="text-sm text-muted2">
            The market regime endpoint is free to explore. Full access (DNA analysis, swarm, research query) requires
            an Enterprise plan.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-navy">What You Can Build</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {CAPABILITIES.map((cap) => (
              <div key={cap.title} className="space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm">
                <cap.Icon className="h-8 w-8 text-primary" aria-hidden />
                <h3 className="font-bold text-navy">{cap.title}</h3>
                <p className="text-sm leading-relaxed text-slate2">{cap.desc}</p>
                <code className="block rounded border border-primary/15 bg-primary-light/50 px-2 py-1 font-mono text-xs text-primary-dark">
                  {cap.endpoint}
                </code>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary-light/40 p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-navy">Enterprise API Access</h2>
              <p className="mt-1 text-slate2">10,000 API calls/day · All endpoints · Dedicated support</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-navy">
                $999<span className="text-lg font-normal text-muted2">/mo</span>
              </p>
              <p className="mt-0.5 text-xs text-muted2">Custom pricing for higher volumes</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/pricing"
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Start Free Trial
            </Link>
            <Link href="/contact-sales" className="text-sm text-muted2 transition-colors hover:text-navy">
              Contact Sales for custom volume →
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-navy">Authentication</h2>
          <p className="text-slate2">
            All API requests must include your API key in the{' '}
            <code className="rounded bg-surface-2 px-1 font-mono text-sm text-primary-dark">X-NeuFin-API-Key</code>{' '}
            header. Generate keys from the{' '}
            <Link href="/developer/keys" className="font-medium text-primary hover:underline">
              keys dashboard
            </Link>
            .
          </p>
          <div className="space-y-3 rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted2">Base URL</span>
              <code className="font-mono text-sm text-primary-dark">{BASE_URL}</code>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted2">Auth Header</span>
              <code className="font-mono text-sm text-primary-dark">X-NeuFin-API-Key: &lt;key&gt;</code>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted2">Rate Limit</span>
              <code className="font-mono text-sm text-primary-dark">10,000 req/day</code>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted2">Response format</span>
              <code className="font-mono text-sm text-primary-dark">application/json</code>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
