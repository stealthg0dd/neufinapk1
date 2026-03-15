'use client'

/**
 * PaywallOverlay.tsx — Bloomberg-style institutional gate.
 *
 * Wraps any section with a blur + amber lock box when locked=true.
 * Design language matches the swarm terminal: #0D0D0D bg, #FFB900 amber,
 * monospaced font, NO rounded corners.
 *
 * Usage:
 *   <PaywallOverlay locked={!isPro} onUnlock={startCheckout}>
 *     <RiskMatrix ... />
 *   </PaywallOverlay>
 */

import React from 'react'

interface PaywallOverlayProps {
  locked:     boolean
  onUnlock:   () => void
  loading?:   boolean
  label?:     string   // override the default lock label
  price?:     string   // override "$29"
  children:   React.ReactNode
}

const MONO = "'Fira Code','Courier New',monospace"
const A    = '#FFB900'
const BG   = '#0D0D0D'
const GRID = '#333333'
const BODY = '#C8C8C8'

export default function PaywallOverlay({
  locked,
  onUnlock,
  loading = false,
  label   = 'INSTITUTIONAL INTELLIGENCE LOCKED',
  price   = '$29',
  children,
}: PaywallOverlayProps) {
  if (!locked) return <>{children}</>

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Blurred content underneath */}
      <div style={{
        filter: 'blur(6px)',
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: 0.45,
      }}>
        {children}
      </div>

      {/* Lock overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `${BG}cc`,   // semi-transparent
        zIndex: 10,
      }}>
        <div style={{
          background: BG,
          border: `1px solid ${A}`,
          maxWidth: 520,
          width: '90%',
          fontFamily: MONO,
        }}>
          {/* Header bar */}
          <div style={{
            background: '#111',
            borderBottom: `1px solid ${A}50`,
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ color: A, fontSize: 8, letterSpacing: 3, textTransform: 'uppercase' }}>
              NEUFIN / IC BRIEFING
            </span>
            <span style={{
              marginLeft: 'auto', color: A, fontSize: 8,
              border: `1px solid ${A}50`, padding: '1px 5px',
              letterSpacing: 1,
            }}>
              RESTRICTED
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 20px 16px' }}>
            {/* Lock icon */}
            <div style={{
              textAlign: 'center',
              fontSize: 28,
              marginBottom: 12,
              color: A,
              letterSpacing: 2,
            }}>
              ◈
            </div>

            {/* Label */}
            <div style={{
              color: A,
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: 3,
              textTransform: 'uppercase',
              textAlign: 'center',
              marginBottom: 8,
            }}>
              {label}
            </div>

            {/* Sub-copy */}
            <div style={{
              color: BODY,
              fontSize: 10,
              lineHeight: 1.6,
              textAlign: 'center',
              marginBottom: 16,
            }}>
              UNLOCK FULL MD BRIEFING &amp; TAX-NEUTRAL ACTION PLAN
            </div>

            {/* Feature list */}
            <div style={{
              borderTop: `1px solid ${GRID}`,
              borderBottom: `1px solid ${GRID}`,
              padding: '10px 0',
              marginBottom: 16,
            }}>
              {[
                '📊  Risk Matrix — Systemic Cluster Map + Regime Stress',
                '💸  Tax-Neutral Exit Strategy — Pair-Matched Harvesting',
                '🎯  90-Day Directive — Non-Negotiable Actions',
                '📉  QQQ/SPY Benchmark Comparison per Scenario',
              ].map((line, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  color: BODY,
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}>
                  <span style={{ color: '#444', marginRight: 2 }}>›</span>
                  {line}
                </div>
              ))}
            </div>

            {/* CTA button */}
            <button
              onClick={onUnlock}
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'transparent' : A,
                color: loading ? A : '#000',
                border: `1px solid ${A}`,
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: 'uppercase',
                padding: '12px 0',
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    display: 'inline-block',
                    width: 12, height: 12,
                    border: `2px solid ${A}40`,
                    borderTopColor: A,
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  REDIRECTING TO CHECKOUT...
                </>
              ) : (
                `▶  UNLOCK INSTITUTIONAL BRIEFING  ·  ${price}`
              )}
            </button>

            <div style={{
              textAlign: 'center',
              color: '#444',
              fontSize: 8,
              letterSpacing: 1,
              marginTop: 8,
              textTransform: 'uppercase',
            }}>
              Secured by Stripe · Instant delivery · One-time payment
            </div>
          </div>
        </div>
      </div>

      {/* CSS for spinner (injected inline since this is a client component) */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
