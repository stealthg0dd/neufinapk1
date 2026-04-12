'use client'

export type SwarmSourceItem = {
  id: string
  label: string
  description: string
}

export type SwarmSourcesPayload = {
  items?: SwarmSourceItem[]
  tickers?: string[]
  disclaimer?: string
}

export type SwarmObsStep = {
  agent: string
  status: string
  summary?: string
  ts?: string
  duration_ms?: number
  meta?: Record<string, unknown>
}

export type SwarmObservabilityPayload = {
  steps?: SwarmObsStep[]
  pipeline?: string
  runtime?: string
}

export function SwarmSourcesPanel({
  sources,
  observability,
}: {
  sources?: SwarmSourcesPayload | null
  observability?: SwarmObservabilityPayload | null
}) {
  const items = sources?.items ?? []
  const steps = observability?.steps ?? []
  if (!items.length && !steps.length) return null

  return (
    <div className="max-w-[1600px] mx-auto px-4 pb-6">
      <div className="rounded-md border border-[#2a2a2a] bg-[#0d0d0d] p-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-400/90">
            Sources & methodology
          </span>
          {observability?.runtime ? (
            <span className="text-[10px] text-[#555]">
              · runtime: {observability.runtime}
            </span>
          ) : null}
          {observability?.pipeline ? (
            <span className="text-[10px] text-[#555]">· {observability.pipeline}</span>
          ) : null}
        </div>

        {items.length > 0 ? (
          <ul className="mb-4 space-y-2 border-b border-[#1e1e1e] pb-4">
            {items.map((s) => (
              <li key={s.id} className="text-[11px] leading-relaxed">
                <span className="font-bold text-[#e5e5e5]">{s.label}</span>
                <span className="text-[#666]"> — </span>
                <span className="text-[#9ca3af]">{s.description}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {sources?.tickers && sources.tickers.length > 0 ? (
          <p className="mb-4 font-mono text-[10px] text-[#6b7280]">
            Tickers in this run:{' '}
            <span className="text-[#a1a1aa]">{sources.tickers.join(', ')}</span>
          </p>
        ) : null}

        {steps.length > 0 ? (
          <details className="group">
            <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-widest text-[#FFB900] hover:text-[#ffc933]">
              <span className="inline group-open:hidden">Show agent run log ({steps.length} events)</span>
              <span className="hidden group-open:inline">Hide agent run log</span>
            </summary>
            <div className="mt-4 max-h-64 overflow-y-auto rounded border border-[#1e1e1e] bg-[#080808] p-2 font-mono text-[10px] text-[#9ca3af]">
              {steps.map((ev, i) => (
                <div
                  key={`${ev.agent}-${ev.ts}-${i}`}
                  className="border-b border-[#1a1a1a] py-1 last:border-0"
                >
                  <span className="text-[#444]">{ev.ts?.slice(11, 23) ?? '—'}</span>{' '}
                  <span className="text-cyan-400/80">{ev.agent}</span>{' '}
                  <span className={ev.status === 'complete' ? 'text-green-500/90' : 'text-amber-400/90'}>
                    {ev.status}
                  </span>
                  {typeof ev.duration_ms === 'number' ? (
                    <span className="text-[#666]"> · {ev.duration_ms.toFixed(0)}ms</span>
                  ) : null}
                  {ev.summary ? <span className="text-[#555]"> — {ev.summary}</span> : null}
                </div>
              ))}
            </div>
          </details>
        ) : null}

        {sources?.disclaimer ? (
          <p className="mt-4 text-[10px] leading-relaxed text-[#555]">{sources.disclaimer}</p>
        ) : null}
      </div>
    </div>
  )
}
