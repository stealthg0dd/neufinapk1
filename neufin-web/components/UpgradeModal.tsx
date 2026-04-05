'use client'

/**
 * UpgradeModal — shown when a 402 response is received (limit reached).
 *
 * Listens to the global 'subscription:required' CustomEvent dispatched by
 * authFetch in lib/api.ts, then renders an upgrade prompt.
 *
 * Usage: mount once in a layout / root component:
 *   <UpgradeModal />
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

const PLAN_OPTIONS = [
  {
    id: 'retail',
    name: 'Retail Investor',
    price: 29,
    period: '/mo',
    description: 'Unlimited DNA analyses + Swarm AI',
    priceId: 'price_1TIuPkGVXReXuoyMrADQfcSQ',
    highlight: false,
  },
  {
    id: 'advisor',
    name: 'Financial Advisor',
    price: 299,
    period: '/mo',
    description: 'Multi-client + white-label PDF reports',
    priceId: 'price_1TIuPlGVXReXuoyMICYnUmXR',
    highlight: true,
  },
]

const API = process.env.NEXT_PUBLIC_API_URL

export default function UpgradeModal() {
  const { token } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('retail')

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('subscription:required', handler)
    return () => window.removeEventListener('subscription:required', handler)
  }, [])

  async function handleUpgrade() {
    const plan = PLAN_OPTIONS.find((p) => p.id === selectedPlan)
    if (!plan) return

    setLoading(true)
    try {
      const origin = window.location.origin
      const res = await fetch(`${API}/api/reports/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          plan: selectedPlan,
          price_id: plan.priceId,
          success_url: `${origin}/pricing/success`,
          cancel_url: `${origin}/pricing`,
        }),
      })
      if (!res.ok) throw new Error('Checkout failed')
      const data = await res.json()
      if (data.checkout_url) {
        window.location.href = data.checkout_url
      }
    } catch {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="glass-card rounded-2xl w-full max-w-md border border-blue-500/20 shadow-2xl shadow-blue-500/10">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800/60">
          <div>
            <h2 className="text-lg font-bold text-white">Upgrade Your Plan</h2>
            <p className="text-sm text-gray-400 mt-0.5">You&apos;ve reached your monthly limit</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Choose a plan to continue with unlimited analyses and advanced features:
          </p>

          {/* Plan options */}
          <div className="space-y-3">
            {PLAN_OPTIONS.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                  selectedPlan === plan.id
                    ? 'border-blue-500/60 bg-blue-500/10'
                    : 'border-gray-700/60 hover:border-gray-600'
                } ${plan.highlight ? 'ring-1 ring-purple-500/20' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{plan.name}</span>
                      {plan.highlight && (
                        <span className="bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <span className="text-lg font-bold text-white">${plan.price}</span>
                    <span className="text-gray-500 text-xs">{plan.period}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full btn-primary py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Redirecting to checkout…
              </>
            ) : (
              'Upgrade Now →'
            )}
          </button>

          <p className="text-xs text-gray-600 text-center">
            Secured by Stripe · Cancel anytime · Instant access
          </p>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => { setOpen(false); window.location.href = '/pricing' }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              See all plans →
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
