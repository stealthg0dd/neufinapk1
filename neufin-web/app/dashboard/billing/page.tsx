'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { getSubscriptionStatus, createStripePortal, getVaultHistory } from '@/lib/api'
import type { VaultRecord } from '@/lib/api'
import Link from 'next/link'

// ── Plan display helpers ───────────────────────────────────────────────────────
const PLAN_LABELS: Record<string, string> = {
  trial: 'Free Trial',
  active: 'Neufin Pro',
  expired: 'Trial Expired',
}

const PLAN_COLORS: Record<string, string> = {
  trial: 'text-amber-700',
  active: 'text-emerald-700',
  expired: 'text-red-700',
}

function getPlanLabel(status: 'trial' | 'active' | 'expired'): string {
  switch (status) {
    case 'trial':
      return PLAN_LABELS.trial
    case 'active':
      return PLAN_LABELS.active
    case 'expired':
      return PLAN_LABELS.expired
    default:
      return 'Unknown'
  }
}

function getPlanColor(status: 'trial' | 'active' | 'expired'): string {
  switch (status) {
    case 'trial':
      return PLAN_COLORS.trial
    case 'active':
      return PLAN_COLORS.active
    case 'expired':
      return PLAN_COLORS.expired
    default:
      return 'text-slate-400'
  }
}

// ── Date formatter ─────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const fmtCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// ── Billing page ───────────────────────────────────────────────────────────────
export default function BillingPage() {
  const { token } = useAuth()

  const [status, setStatus] = useState<'trial' | 'active' | 'expired'>('trial')
  const [daysRemaining, setDaysRemaining] = useState<number | undefined>(undefined)
  const [history, setHistory] = useState<VaultRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)

  useEffect(() => {
    if (!token) return
    Promise.all([
      getSubscriptionStatus(token),
      getVaultHistory(token).then((d) => d.history).catch(() => []),
    ]).then(([sub, hist]) => {
      setStatus(sub.status)
      setDaysRemaining(sub.days_remaining)
      setHistory(hist)
    }).finally(() => setLoading(false))
  }, [token])

  const handleManageBilling = async () => {
    if (!token) return
    setPortalLoading(true)
    setPortalError('')
    try {
      const { portal_url } = await createStripePortal(`${window.location.origin}/dashboard/billing`, token)
      window.location.href = portal_url
    } catch (e: unknown) {
      setPortalError(e instanceof Error ? e.message : 'Could not open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="page-container flex max-w-2xl flex-col gap-6 py-section">
      <div className="section-header">
        <div>
          <h1>Subscription & Billing</h1>
          <p>Manage your Neufin plan</p>
        </div>
      </div>

      {/* Current plan */}
      <div className="data-card rounded-xl">
        <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-4">Current Plan</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-xl font-bold ${getPlanColor(status)}`}>{getPlanLabel(status)}</p>
            {status === 'trial' && daysRemaining !== undefined && (
              <p className="text-sm text-[#64748B] mt-0.5">
                {daysRemaining > 0
                  ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
                  : 'Trial has ended'}
              </p>
            )}
            {status === 'active' && (
              <p className="text-sm text-[#64748B] mt-0.5">$99 / month · billed via Stripe</p>
            )}
          </div>

          {status !== 'active' && (
            <Link
              href="/upgrade"
              className="btn-primary text-sm py-2 px-4"
            >
              Upgrade to Pro
            </Link>
          )}
        </div>

        {/* Pro features list */}
        {status === 'active' && (
          <ul className="mt-4 space-y-1.5 text-sm text-[#334155]">
            {[
              'Unlimited advisor reports',
              'White-label branding',
              'Priority AI (Claude primary)',
              'Swarm portfolio analysis',
              'API access',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-green-500">✓</span> {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Manage billing (Stripe portal) */}
      {status === 'active' && (
        <div className="data-card rounded-xl">
          <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-4">Manage Billing</h2>
          <p className="text-sm text-[#334155] mb-4">
            Update your payment method, download invoices, or cancel your subscription via the Stripe Customer Portal.
          </p>
          {portalError && <p className="text-xs text-red-400 mb-3">{portalError}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="btn-outline text-sm py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {portalLoading ? 'Opening…' : 'Manage Subscription'}
            </button>
            <button
              onClick={() => setShowCancelModal(true)}
              className="py-2 px-4 text-sm text-red-400 border border-red-700/50 rounded-lg hover:bg-red-900/20 transition-colors"
            >
              Cancel Plan
            </button>
          </div>
        </div>
      )}

      {/* DNA Score history (invoice-like record) */}
      {history.length > 0 && (
        <div className="data-card rounded-xl">
          <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-4">
            Analysis History
          </h2>
          <div className="divide-y divide-[#F1F5F9]">
            {history.map((record) => (
              <div key={record.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-navy">{record.investor_type}</p>
                  <p className="text-xs text-[#64748B] mt-0.5">{fmtDate(record.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-primary">Score {record.dna_score}</p>
                  <p className="text-xs text-[#64748B]">{fmtCurrency.format(record.total_value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-navy mb-2">Cancel Subscription?</h3>
            <p className="text-sm text-[#64748B] mb-5">
              Your plan will remain active until the end of the billing period. You can re-subscribe at any time.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2 rounded-lg border border-[#E2E8F0] text-sm text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
              >
                Keep Plan
              </button>
              <button
                onClick={async () => { setShowCancelModal(false); await handleManageBilling() }}
                className="flex-1 py-2 rounded-lg bg-red-700 text-sm text-white font-semibold hover:bg-red-600 transition-colors"
              >
                Cancel Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
