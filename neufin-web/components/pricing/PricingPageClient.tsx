'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { apiFetch } from '@/lib/api-client'
import { GlassCard } from '@/components/ui/GlassCard'
import toast from 'react-hot-toast'
import { stripeSuccessUrlDashboard } from '@/lib/stripe-checkout-urls'

const faqs = [
  {
    q: 'What payment methods do you accept?',
    a: 'We bill in USD via Stripe. Major cards and supported wallets are accepted where Stripe enables them.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel subscription from the billing portal; access continues through the end of the paid period.',
  },
  {
    q: 'Is NeuFin regulated financial advice?',
    a: 'No. NeuFin provides analytics and research tools for professionals. It is not personalized financial advice.',
  },
  {
    q: 'Do you offer trials?',
    a: 'The Advisor tier includes a 14-day trial when checkout is available. Enterprise starts with a scoping call.',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <GlassCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 p-4 text-left text-sm font-medium text-[var(--text-primary)]"
      >
        {q}
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      >
        <p className="px-4 pb-4 text-sm text-[var(--text-secondary)] leading-relaxed">{a}</p>
      </motion.div>
    </GlassCard>
  )
}

export default function PricingPageClient() {
  const { getAccessToken } = useAuth()
  const [annual, setAnnual] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const advisorMonthly = 299
  const entMonthly = 999
  const advDisplay = annual ? Math.round((advisorMonthly * 10) / 12) : advisorMonthly
  const entDisplay = annual ? Math.round((entMonthly * 10) / 12) : entMonthly

  async function startAdvisorCheckout() {
    setCheckoutLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error('Sign in to start your trial')
        window.location.href = '/login?next=/pricing'
        return
      }
      const origin = window.location.origin
      const res = await apiFetch('/api/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan: 'unlimited',
          success_url: stripeSuccessUrlDashboard(origin),
          cancel_url: `${origin}/pricing`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.detail === 'string' ? data.detail : 'Checkout unavailable')
        return
      }
      if (data.checkout_url) window.location.href = data.checkout_url
      else toast.error('No checkout URL returned')
    } catch {
      toast.error('Checkout failed')
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] flex flex-col">
      <nav className="border-b border-[var(--border)] backdrop-blur-xl sticky top-0 z-10 bg-[var(--canvas)]/90">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="font-display text-xl text-[var(--amber)]">
            NeuFin
          </Link>
          <div className="flex gap-2">
            <Link href="/upload" className="btn-outline py-2 text-xs sm:text-sm px-3">
              Analysis
            </Link>
            <Link href="/login" className="btn-primary py-2 text-xs sm:text-sm px-3">
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 px-4 sm:px-6 py-16">
        <div className="max-w-5xl mx-auto text-center mb-12">
          <h1 className="font-display text-4xl md:text-5xl text-[var(--text-primary)] mb-4">Pricing</h1>
          <p className="text-[var(--text-secondary)] max-w-xl mx-auto">
            Institutional workflows, without the terminal price tag.
          </p>

          <div className="mt-8 inline-flex p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] relative">
            <motion.div
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-[var(--amber)]/20 border border-[var(--border-accent)]"
              layout
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              style={{ left: annual ? 'calc(50% + 2px)' : 4 }}
            />
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`relative z-10 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                !annual ? 'text-[var(--amber)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`relative z-10 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                annual ? 'text-[var(--amber)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              Annual
            </button>
          </div>
          {annual && (
            <p className="mt-3 text-xs text-[var(--emerald)] font-medium">2 months free on paid tiers — billed annually</p>
          )}
        </div>

        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6 items-stretch">
          {/* Free */}
          <GlassCard className="p-6 flex flex-col">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Free</p>
            <p className="font-display text-4xl text-[var(--text-primary)] mb-1">$0</p>
            <p className="text-sm text-[var(--text-secondary)] mb-6">per month</p>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)] flex-1 mb-6">
              {['3 DNA analyses', 'Basic behavioral report', 'CSV upload'].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="w-4 h-4 text-[var(--emerald)] shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/upload" className="btn-outline w-full text-center text-sm py-3 block rounded-xl">
              Start Free
            </Link>
          </GlassCard>

          {/* Advisor */}
          <GlassCard className="p-6 flex flex-col relative border-[var(--border-accent)] shadow-[0_0_60px_-20px_rgba(245,166,35,0.45)]">
            <span className="absolute -top-3 right-4 text-[10px] font-bold uppercase tracking-wider bg-[var(--amber)] text-[var(--canvas)] px-2 py-1 rounded-full">
              Most Popular
            </span>
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Advisor</p>
            <p className="font-display text-4xl text-[var(--amber)] mb-1 font-normal">
              ${advDisplay}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              per month{annual ? ', billed annually' : ''}
            </p>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)] flex-1 mb-6">
              {[
                'Unlimited analyses',
                '10 advisor reports / mo',
                'Multi-client workspace',
                'API access',
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="w-4 h-4 text-[var(--emerald)] shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={checkoutLoading}
              onClick={startAdvisorCheckout}
              className="w-full py-3 rounded-xl bg-[var(--amber)] text-[var(--canvas)] font-semibold text-sm disabled:opacity-50"
            >
              {checkoutLoading ? 'Redirecting…' : 'Start 14-Day Free Trial'}
            </button>
          </GlassCard>

          {/* Enterprise */}
          <GlassCard className="p-6 flex flex-col border-[var(--blue)]/35">
            <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">Enterprise</p>
            <p className="font-display text-4xl text-[var(--text-primary)] mb-1">${entDisplay}</p>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              per month{annual ? ', billed annually' : ''}
            </p>
            <p className="text-xs text-[var(--blue)] mb-6">Custom pricing available</p>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)] flex-1 mb-6">
              {[
                'Everything in Advisor',
                'Unlimited reports',
                'White-label',
                'Dedicated support',
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="w-4 h-4 text-[var(--emerald)] shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/contact-sales"
              className="btn-outline w-full text-center text-sm py-3 block rounded-xl border-[var(--blue)]/40"
            >
              Contact Sales
            </Link>
          </GlassCard>
        </div>

        <div className="max-w-2xl mx-auto mt-16 space-y-3">
          <h2 className="font-display text-2xl text-center mb-6 text-[var(--text-primary)]">FAQ</h2>
          {faqs.map((f) => (
            <FAQItem key={f.q} {...f} />
          ))}
        </div>
      </main>

      <section className="border-t border-[var(--border)] py-8 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            <strong className="text-[var(--text-secondary)]">Regulatory Disclaimer:</strong> NeuFin provides financial
            data and analysis tools for informational and educational purposes only. This is not financial advice.
            Past performance does not indicate future results. NeuFin aligns with MAS guidelines on fintech and data
            services.
          </p>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-[var(--text-muted)]">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center">
          <Image src="/logo.png" alt="NeuFin" width={90} height={26} className="mb-3 h-6 w-auto opacity-80" />
          <span>NeuFin © {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  )
}
