'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { apiFetch, apiGet, apiPost } from '@/lib/api-client'
import { stripeSuccessUrlReports } from '@/lib/stripe-checkout-urls'

type Props = {
  portfolioId: string | null | undefined
  className?: string
  children?: React.ReactNode
}

export function GenerateIcReportButton({ portfolioId, className, children }: Props) {
  const [loading, setLoading] = useState(false)

  const run = async () => {
    if (!portfolioId) {
      toast.error('No portfolio linked to this analysis. Run a portfolio analysis first.')
      return
    }
    try {
      setLoading(true)
      const statusRes = await apiGet<{
        plan: 'free' | 'retail' | 'advisor' | 'enterprise'
        status?: string
      }>('/api/subscription/status')
      const currentPlan = statusRes.plan
      const canGeneratePdf =
        currentPlan === 'advisor' ||
        currentPlan === 'enterprise' ||
        statusRes.status === 'trial'

      if (canGeneratePdf) {
        const res = await apiFetch('/api/reports/generate', {
          method: 'POST',
          body: JSON.stringify({
            portfolio_id: portfolioId,
            advisor_id: 'self',
            advisor_name: 'NeuFin',
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          const detail =
            typeof (err as { detail?: unknown }).detail === 'string'
              ? (err as { detail: string }).detail
              : 'Report generation failed'
          throw new Error(detail)
        }
        const data = (await res.json()) as {
          pdf_url?: string
          url?: string
          download_url?: string
          report_url?: string
          checkout_url?: string
        }
        if (data.checkout_url) {
          window.location.href = data.checkout_url
          return
        }
        const pdfUrl =
          data.pdf_url || data.url || data.download_url || data.report_url || null
        if (pdfUrl) {
          window.open(pdfUrl, '_blank')
          toast.success('Report ready')
        } else {
          toast.error('Report URL unavailable. Try again.')
        }
      } else {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        const { checkout_url } = await apiPost<{ checkout_url: string }>('/api/reports/checkout', {
          plan: 'single',
          portfolio_id: portfolioId,
          success_url: stripeSuccessUrlReports(origin),
          cancel_url: `${origin}/dashboard/reports`,
        })
        window.location.href = checkout_url
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Report unavailable.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={loading || !portfolioId}
      className={
        className ??
        'text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      {loading ? (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Generating…
        </span>
      ) : (
        children ?? 'Generate Report'
      )}
    </button>
  )
}
