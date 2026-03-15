'use client'

export const dynamic = 'force-dynamic'

import React, { Suspense, useState, useCallback, useEffect } from 'react'
import SwarmTerminal from '@/components/SwarmTerminal'
import CommandPalette from '@/components/CommandPalette'
import RiskMatrix from '@/components/RiskMatrix'
import PaywallOverlay from '@/components/PaywallOverlay'
import SlidingChatPane from '@/components/SlidingChatPane'
import { PriceWarningBanner } from '@/components/PriceWarningBanner'
import { useUser } from '@/lib/store'
import { useBackendHealth } from '@/lib/useBackendHealth'

// ── Demo positions ─────────────────────────────────────────────────────────────
const DEMO_POSITIONS = [
  { symbol: 'AAPL',  shares: 50,  price: 195.0, value: 9750,  weight: 0.19 },
  { symbol: 'MSFT',  shares: 30,  price: 415.0, value: 12450, weight: 0.25 },
  { symbol: 'NVDA',  shares: 20,  price: 875.0, value: 17500, weight: 0.35 },
  { symbol: 'XOM',   shares: 40,  price: 115.0, value: 4600,  weight: 0.09 },
  { symbol: 'BRK-B', shares: 15,  price: 405.0, value: 6075,  weight: 0.12 },
]
const DEMO_TOTAL = DEMO_POSITIONS.reduce((s, p) => s + p.value, 0)

// ── Markdown → Bloomberg terminal renderer ─────────────────────────────────────
/**
 * Converts the IC Briefing markdown to terminal-styled JSX.
 * No external dependencies — handles ##, **, -, numbered lists, and `code`.
 */
function renderBoldInline(text: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="text-white font-bold">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  )
}

function ICBriefing({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')

  return (
    <div className="space-y-[3px] text-[11px] leading-relaxed">
      {lines.map((line, idx) => {
        // H2 → amber section header
        if (/^## /.test(line)) {
          return (
            <div key={idx} className="pt-4 first:pt-0">
              <div className="text-[#FFB900] font-bold text-[12px] uppercase tracking-widest border-b border-[#FFB900]/20 pb-1 mb-2">
                {line.replace(/^##\s*/, '')}
              </div>
            </div>
          )
        }
        // H3 → dimmer subheader
        if (/^### /.test(line)) {
          return (
            <div key={idx} className="text-[#aaa] font-bold uppercase tracking-wider text-[10px] mt-2">
              {line.replace(/^###\s*/, '')}
            </div>
          )
        }
        // Bullet directive lines (- **Trim...**)
        if (/^[-*]\s/.test(line)) {
          const content = line.replace(/^[-*]\s/, '')
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-[#00FF00] shrink-0 mt-0.5">›</span>
              <span className="text-[#C8C8C8]">{renderBoldInline(content, `b${idx}`)}</span>
            </div>
          )
        }
        // Numbered list
        if (/^\d+\.\s/.test(line)) {
          const num     = line.match(/^(\d+)\./)?.[1]
          const content = line.replace(/^\d+\.\s/, '')
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-[#FFB900] shrink-0 font-bold w-4">{num}.</span>
              <span className="text-[#C8C8C8]">{renderBoldInline(content, `n${idx}`)}</span>
            </div>
          )
        }
        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
          return <div key={idx} className="border-t border-[#2a2a2a] my-2" />
        }
        // Empty line
        if (!line.trim()) {
          return <div key={idx} className="h-1" />
        }
        // Default paragraph
        return (
          <p key={idx} className="text-[#A8A8A8]">
            {renderBoldInline(line, `p${idx}`)}
          </p>
        )
      })}
    </div>
  )
}

// ── Score pill ─────────────────────────────────────────────────────────────────
function ScorePill({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[9px] uppercase tracking-wider">
        <span className="text-[#555]">{label}</span>
        <span style={{ color }}>{value}/{max}</span>
      </div>
      <div className="h-[3px] bg-[#1a1a1a] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SwarmPage() {
  const [traces,          setTraces]         = useState<string[]>([])
  const [isRunning,       setIsRunning]       = useState(false)
  const [thesis,          setThesis]          = useState<Record<string, any> | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [unlockedLocally, setUnlockedLocally] = useState(false)
  const [toast,           setToast]           = useState<string | null>(null)
  const [chatOpen,        setChatOpen]        = useState(false)
  const [failedTickers,   setFailedTickers]   = useState<string[]>([])

  const { isPro, token } = useUser()
  const isUnlocked = isPro || unlockedLocally

  useBackendHealth()

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://neufin101-production.up.railway.app'

  // ── Handle Stripe redirect back with ?checkout_success=1 ──────────────────
  const handlePaymentSuccess = useCallback(async () => {
    // 1. Claim any guest session data so the report is tied to this user
    const sessionId = typeof window !== 'undefined'
      ? localStorage.getItem('neufin-session-id')
      : null

    if (sessionId && token) {
      try {
        await fetch(`${API_BASE}/api/vault/claim-session`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ session_id: sessionId }),
        })
        localStorage.removeItem('neufin-session-id')
      } catch {
        // non-critical — ownership claim is best-effort
      }
    }

    // 2. Unlock the paywall immediately (webhook may not have processed yet)
    setUnlockedLocally(true)

    // 3. Show a toast and clean the URL
    setToast('REPORT UNLOCKED — Full IC Briefing now available')
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('checkout_success')
      window.history.replaceState({}, '', url.toString())
    }
    setTimeout(() => setToast(null), 5000)
  }, [API_BASE, token])

  // Detect Stripe success redirect
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout_success') === '1') {
      handlePaymentSuccess()
    }
  }, [handlePaymentSuccess])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Stripe checkout for the paywall CTA
  const startCheckout = useCallback(async () => {
    setCheckoutLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          plan: 'single',
          record_id: thesis?.swarm_report_id ?? '',
          success_url: `${window.location.origin}/swarm?checkout_success=1`,
          cancel_url: window.location.href,
        }),
      })
      const data = await res.json()
      if (data.checkout_url) window.location.href = data.checkout_url
    } catch {
      setCheckoutLoading(false)
    }
  }, [API_BASE, token, thesis])

  // ── Restore last report from localStorage on mount ────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedId = localStorage.getItem('neufin-swarm-report-id')
    if (!savedId || thesis) return
    fetch(`${API_BASE}/api/swarm/report/${savedId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.investment_thesis) {
          setThesis(data.investment_thesis)
          setTraces(['[System] Previous session report restored.'])
        }
      })
      .catch(() => {/* non-critical */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_BASE, token])

  const runSwarm = async () => {
    setTraces([])
    setThesis(null)
    setIsRunning(true)

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }

      const res = await fetch(`${API_BASE}/api/swarm/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ positions: DEMO_POSITIONS, total_value: DEMO_TOTAL }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      const data = await res.json()
      const newThesis = data.investment_thesis ?? null
      setTraces(data.agent_trace ?? [])
      setThesis(newThesis)
      if (data.failed_tickers?.length) setFailedTickers(data.failed_tickers)

      // Persist so the user doesn't lose their analysis on refresh
      if (newThesis?.swarm_report_id && typeof window !== 'undefined') {
        localStorage.setItem('neufin-swarm-report-id', newThesis.swarm_report_id)
      }
    } catch (e: any) {
      setTraces(prev => [...prev, `[System] ERROR: ${e.message}`])
    } finally {
      setIsRunning(false)
    }
  }

  const sb = thesis?.score_breakdown ?? {}

  return (
    <div
      className="min-h-screen bg-[#080808] text-white"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace" }}
    >
      {/* ── Toast notification ─────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#0D0D0D', border: '1px solid #FFB900',
          color: '#FFB900', fontFamily: "'Fira Code','Courier New',monospace",
          fontSize: 11, letterSpacing: 2, padding: '10px 24px',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
          boxShadow: '0 0 24px #FFB90033',
          animation: 'fadeInDown 0.2s ease',
        }}>
          ◈ {toast}
          <style>{`@keyframes fadeInDown { from { opacity: 0; transform: translateX(-50%) translateY(-8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
        </div>
      )}

      {/* ── Nav ───────────────────────────────────────────────────────── */}
      <nav className="border-b border-[#1e1e1e] bg-[#0d0d0d] px-6 h-12 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-[#FFB900] font-bold text-[13px] tracking-widest">NEUFIN</span>
          <span className="text-[#333] text-[11px]">/</span>
          <span className="text-[#555] text-[11px] uppercase tracking-widest">Investment Committee</span>
        </div>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <CommandPalette
              positions={DEMO_POSITIONS}
              total_value={DEMO_TOTAL}
              onResponse={r => setTraces(prev => [...prev, ...r.thinking_steps])}
            />
          </Suspense>
          {thesis && (
            <button
              onClick={() => setChatOpen(o => !o)}
              className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest border transition-all"
              style={{
                background:  chatOpen ? '#FFB90022' : 'transparent',
                color:       '#FFB900',
                borderColor: '#FFB90066',
              }}
            >
              {chatOpen ? '✕ CLOSE MD' : '◈ ASK MD'}
            </button>
          )}
          <button
            onClick={runSwarm}
            disabled={isRunning}
            className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded border transition-all disabled:opacity-40"
            style={{
              background:  isRunning ? 'transparent' : '#FFB900',
              color:       isRunning ? '#FFB900'     : '#000',
              borderColor: '#FFB900',
            }}
          >
            {isRunning ? '● RUNNING...' : '▶ RUN SWARM'}
          </button>
        </div>
      </nav>

      {/* ── Main 3-column layout ──────────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto px-4 py-5 grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* ── Agent trace terminal (5 cols) ──────────────────────────── */}
        <div className="xl:col-span-5">
          <SwarmTerminal traces={traces} isRunning={isRunning} />
        </div>

        {/* ── IC Briefing (5 cols) ────────────────────────────────────── */}
        <div className="xl:col-span-5">
          <div className="bg-[#0D0D0D] border border-[#2a2a2a] rounded-md overflow-hidden flex flex-col h-full min-h-[420px]">
            {/* Header */}
            <div className="bg-[#141414] px-4 py-2 border-b border-[#2a2a2a] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[#00FF00] text-[11px] font-bold uppercase tracking-widest">
                  IC BRIEFING
                </span>
                <span className="text-[#333] text-[10px]">|</span>
                <span className="text-[#555] text-[10px] uppercase">PE Managing Director</span>
              </div>
              {thesis?.dna_score && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#555] uppercase">DNA</span>
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: thesis.dna_score >= 70 ? '#00FF00' : thesis.dna_score >= 45 ? '#FFB900' : '#ff4444' }}
                  >
                    {thesis.dna_score}<span className="text-[#555] text-[10px]">/100</span>
                  </span>
                </div>
              )}
            </div>

            {/* Briefing body */}
            <div
              className="flex-1 overflow-y-auto px-5 py-4"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a #0d0d0d' }}
            >
              {!thesis && !isRunning && (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                  <div className="text-[#222] text-[40px]">◈</div>
                  <p className="text-[#333] text-[11px] uppercase tracking-widest">
                    IC Briefing awaiting swarm execution
                  </p>
                  <p className="text-[#222] text-[10px]">
                    Click ▶ RUN SWARM to generate the Investment Committee report
                  </p>
                </div>
              )}
              {isRunning && !thesis && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-[#FFB900] text-[11px] animate-pulse uppercase tracking-widest">
                    ● MD is reviewing analyst outputs...
                  </div>
                </div>
              )}
              {thesis?.briefing && (
                <ICBriefing markdown={thesis.briefing} />
              )}
            </div>

            {/* Metadata bar */}
            {thesis && (
              <div className="bg-[#111] border-t border-[#1e1e1e] px-4 py-2 flex gap-3 flex-wrap shrink-0">
                <MetaItem label="REGIME"  value={thesis.regime    ?? 'N/A'} color="blue" />
                <MetaItem label="β"       value={thesis.weighted_beta?.toFixed(2)  ?? '—'} color="amber" />
                <MetaItem label="SHARPE"  value={thesis.sharpe_ratio?.toFixed(2)   ?? '—'} color={
                  (thesis.sharpe_ratio ?? 0) > 1 ? 'green' : (thesis.sharpe_ratio ?? 0) > 0 ? 'amber' : 'red'
                } />
                <MetaItem label="ρ avg"   value={thesis.avg_correlation?.toFixed(3) ?? '—'} color="amber" />
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar (2 cols) ──────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-3">

          {/* Portfolio weight bars */}
          <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-md overflow-hidden">
            <div className="bg-[#141414] px-3 py-1.5 border-b border-[#2a2a2a]">
              <span className="text-[10px] text-[#FFB900] font-bold uppercase tracking-widest">Holdings</span>
            </div>
            <div className="px-3 py-2 space-y-2">
              {DEMO_POSITIONS.map(p => (
                <div key={p.symbol} className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white font-bold">{p.symbol}</span>
                    <span className="text-[#666]">{Math.round(p.weight * 100)}%</span>
                  </div>
                  <div className="h-[2px] bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FFB900]/70 rounded-full"
                      style={{ width: `${Math.round(p.weight * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-1.5 border-t border-[#1e1e1e] flex justify-between text-[10px]">
                <span className="text-[#444]">AUM</span>
                <span className="text-[#00FF00] font-bold">${DEMO_TOTAL.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Score breakdown (after run) */}
          {thesis && Object.keys(sb).length > 0 && (
            <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-md overflow-hidden">
              <div className="bg-[#141414] px-3 py-1.5 border-b border-[#2a2a2a]">
                <span className="text-[10px] text-[#00FF00] font-bold uppercase tracking-widest">Score</span>
              </div>
              <div className="px-3 py-3 space-y-2.5">
                <ScorePill label="HHI"   value={sb.hhi_concentration ?? 0} max={25}  color="#FFB900" />
                <ScorePill label="Beta"  value={sb.beta_risk         ?? 0} max={25}  color="#60a5fa" />
                <ScorePill label="Tax α" value={sb.tax_alpha         ?? 0} max={20}  color="#34d399" />
                <ScorePill label="Corr"  value={sb.correlation       ?? 0} max={30}  color="#c084fc" />
                <div className="border-t border-[#1e1e1e] pt-2 flex justify-between text-[10px]">
                  <span className="text-[#555] uppercase tracking-wider">DNA</span>
                  <span className="text-white font-bold">{thesis.dna_score}/100</span>
                </div>
              </div>
            </div>
          )}

          {/* Cmd+K hint */}
          <div className="text-center space-y-1 py-2">
            <div className="text-[10px] text-[#333]">
              Press <kbd className="border border-[#2a2a2a] rounded px-1 py-0.5 text-[#444]">⌘K</kbd> to query agents
            </div>
            <div className="text-[9px] text-[#222] uppercase tracking-widest">
              Powered by LangGraph
            </div>
          </div>
        </div>

        {/* ── Risk Matrix row (full-width, post-run) ─────────────────────── */}
        {thesis && (
          ((thesis as any).stress_results?.length > 0 || (thesis as any).risk_factors?.length > 0)
        ) && (() => {
          // Transform backend shapes → RiskMatrix prop shapes
          const clusters = ((thesis as any).risk_factors ?? []).map((f: any) => ({
            ticker:      f.symbol,
            beta:        f.beta ?? 1.0,
            correlation: f.spy_correlation ?? 0,
            weight:      (f.weight_pct ?? 0) / 100,
          }))
          const stressResults = ((thesis as any).stress_results ?? []).map((s: any) => ({
            scenario:            s.label ?? s.scenario_name ?? s.key,
            impact:              s.portfolio_return_pct ?? s.impact_pct ?? 0,
            spyImpact:           s.spy_return_pct ?? s.benchmark_impact?.SPY ?? 0,
            qqqImpact:           s.qqq_return_pct ?? s.benchmark_impact?.QQQ ?? 0,
            weakLink:            s.weakest_link?.symbol ?? s.weak_link?.ticker ?? '—',
            alpha_gap_narrative: s.alpha_gap_narrative ?? undefined,
          }))
          return (
            <div className="xl:col-span-12 mt-1">
              <div className="mb-2 flex items-center gap-3">
                <span className="text-[#FFB900] font-bold text-[11px] tracking-widest uppercase">
                  RISK MATRIX
                </span>
                <span className="text-[#333] text-[10px]">|</span>
                <span className="text-[#555] text-[10px] uppercase tracking-widest">
                  Cluster Map · Historical Regime Stress
                </span>
              </div>
              <PaywallOverlay locked={!isUnlocked} onUnlock={startCheckout} loading={checkoutLoading}>
                <RiskMatrix clusters={clusters} stressResults={stressResults} />
              </PaywallOverlay>
            </div>
          )
        })()}

      </div>

      {/* ── Sliding MD Chat pane ──────────────────────────────────────── */}
      <PriceWarningBanner
        failedTickers={failedTickers}
        onDismiss={() => setFailedTickers([])}
      />

      <SlidingChatPane
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        recordId={thesis?.swarm_report_id ?? null}
        thesisContext={thesis ?? undefined}
        positions={DEMO_POSITIONS}
        totalValue={DEMO_TOTAL}
        apiBase={API_BASE}
      />
    </div>
  )
}

function MetaItem({ label, value, color }: { label: string; value: string; color: string }) {
  const cls = color === 'green' ? 'text-[#00FF00]'
            : color === 'amber' ? 'text-[#FFB900]'
            : color === 'blue'  ? 'text-blue-400'
            : color === 'red'   ? 'text-red-400'
            : 'text-[#888]'
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span className="text-[#444] uppercase">{label}:</span>
      <span className={`font-bold ${cls}`}>{value}</span>
    </div>
  )
}
