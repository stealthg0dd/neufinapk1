/**
 * Stripe replaces the literal `{CHECKOUT_SESSION_ID}` in success_url after checkout.
 * @see https://docs.stripe.com/payments/checkout/custom-success-page
 */
function resolveBaseOrigin(origin?: string): string {
  const explicit = (origin || '').trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const app = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').trim()
  if (app) {
    const normalized = app.startsWith('http') ? app : `https://${app}`
    return normalized.replace(/\/$/, '')
  }

  // Local default keeps checkout callback stable in dev.
  return 'http://localhost:3000'
}

export function stripeSuccessUrlDashboard(origin?: string): string {
  const base = resolveBaseOrigin(origin)
  return `${base}/dashboard?session_id={CHECKOUT_SESSION_ID}`
}

export function stripeSuccessUrlReports(origin?: string): string {
  const base = resolveBaseOrigin(origin)
  return `${base}/reports/success?session_id={CHECKOUT_SESSION_ID}`
}
