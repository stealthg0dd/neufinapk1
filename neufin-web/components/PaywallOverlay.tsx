'use client'

/**
 * PaywallOverlay — light institutional gate.
 * Wraps children with blur; shows premium card when locked=true.
 */

import React from 'react'
import { Check, Loader2 } from 'lucide-react'

interface PaywallOverlayProps {
  locked: boolean
  onUnlock: () => void
  loading?: boolean
  /** @deprecated Ignored — title is fixed for premium gate */
  label?: string
  price?: string
  children: React.ReactNode
}

const FEATURES = [
  'Risk matrix — systemic clusters and regime stress',
  'Tax-aware exit ideas — pair-matched harvesting context',
  '90-day directive — prioritized next actions',
  'Scenario view — benchmark comparison hooks',
]

export default function PaywallOverlay({
  locked,
  onUnlock,
  loading = false,
  price = '$29',
  children,
}: PaywallOverlayProps) {
  if (!locked) return <>{children}</>

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none select-none blur-sm opacity-40">{children}</div>

      <div
        className="absolute inset-0 z-10 flex items-center justify-center px-4"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)' }}
      >
        <div className="w-full max-w-[380px] rounded-xl border border-[#E5E7EB] bg-white p-8 shadow-sm">
          <h2 className="text-section-title">Portfolio Intelligence — Premium</h2>

          <ul className="mt-5 space-y-2.5">
            {FEATURES.map((line) => (
              <li key={line} className="flex gap-2 text-[13px] leading-snug text-[#374151]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-dark" strokeWidth={2} aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 border-t border-[#E5E7EB] pt-5 text-center">
            <p className="text-metric">{price}</p>
            <p className="text-muted-marketing mt-1">One-time payment · Instant delivery</p>
          </div>

          <button
            type="button"
            onClick={onUnlock}
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Redirecting…
              </>
            ) : (
              'Unlock Full Briefing'
            )}
          </button>

          <p className="mt-3 text-center text-sm text-slate-500">Secured by Stripe</p>
        </div>
      </div>
    </div>
  )
}
