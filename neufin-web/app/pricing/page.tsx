import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Pricing — Plans for Every Investor',
  description:
    'From individual investors to financial advisory firms and enterprise fintechs — NeuFin has a plan that fits. Start free, upgrade when you need more.',
  openGraph: {
    title: 'NeuFin Pricing — Institutional-Grade Finance Intelligence',
    description:
      'Free DNA analysis, Retail $29/mo, Advisor $299/mo, Enterprise $999/mo. MAS-compliant behavioral finance tools for Southeast Asia.',
  },
}

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: '',
    tagline: '3 DNA analyses per month. No credit card required.',
    badge: null,
    accentColor: 'border-gray-700',
    badgeColor: '',
    ctaText: 'Get Started Free',
    ctaHref: '/upload',
    ctaStyle: 'btn-outline',
    features: [
      '3 Investor DNA analyses / month',
      'Basic behavioral bias detection',
      'Portfolio CSV upload',
      'Public DNA score sharing',
    ],
    missing: [
      'Unlimited analyses',
      'Swarm AI analysis',
      'Advisor reports',
      'API access',
    ],
  },
  {
    id: 'retail',
    name: 'Retail Investor',
    price: 29,
    period: '/mo',
    tagline: 'For individual investors who want institutional-grade analysis.',
    badge: null,
    accentColor: 'border-blue-500/40',
    badgeColor: '',
    ctaText: 'Start Free Trial',
    ctaHref: '/auth?plan=retail',
    ctaStyle: 'btn-primary',
    features: [
      'Unlimited DNA analyses',
      'Swarm AI consensus analysis',
      'Portfolio alerts & watchlist',
      'Mobile app access',
      'Vault — save & compare analyses',
      'Priority email support',
    ],
    missing: [
      'White-label PDF reports',
      'Multi-client dashboard',
      'API access',
    ],
  },
  {
    id: 'advisor',
    name: 'Financial Advisor',
    price: 299,
    period: '/mo',
    tagline: 'For advisors managing multiple client portfolios.',
    badge: 'MOST POPULAR',
    accentColor: 'border-purple-500/60',
    badgeColor: 'bg-purple-500',
    ctaText: 'Start 14-Day Free Trial',
    ctaHref: '/auth?plan=advisor',
    ctaStyle: 'btn-primary',
    features: [
      'Everything in Retail',
      'Multi-client dashboard',
      'White-label PDF reports (10/month)',
      'Advisor branding & firm logo',
      'MAS-compliant audit trail',
      'Client portal access',
      'Dedicated onboarding call',
    ],
    missing: [
      'Unlimited reports',
      'REST API access',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise / API',
    price: 999,
    period: '/mo',
    tagline: 'For fintechs and institutions embedding NeuFin intelligence.',
    badge: null,
    accentColor: 'border-amber-500/40',
    badgeColor: '',
    ctaText: 'Contact Sales',
    ctaHref: '/contact-sales',
    ctaStyle: 'btn-outline',
    features: [
      'Everything in Advisor',
      'Unlimited white-label reports',
      'Full REST API access',
      '10,000 API calls / day',
      'Custom Slack integration',
      'Dedicated account manager',
      'Custom research & data feeds',
      'SLA-backed uptime guarantee',
    ],
    missing: [],
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 backdrop-blur-sm sticky top-0 z-10 bg-gray-950/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <div className="flex items-center gap-3">
            <Link href="/upload" className="btn-outline py-2 text-sm">DNA Score</Link>
            <Link href="/dashboard" className="btn-primary py-2 text-sm">Dashboard</Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 px-6 py-20">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <span className="badge bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-4 inline-block">
              Simple, transparent pricing
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
              Plans for every{' '}
              <span className="text-gradient">investor and firm</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Start free. Upgrade as you grow. Cancel anytime.
            </p>
            {/* Free tier callout */}
            <div className="mt-8 inline-flex items-center gap-3 px-5 py-3 rounded-xl border border-green-500/30 bg-green-500/5 text-green-400 text-sm">
              <span className="text-green-400">✓</span>
              Start for free — 3 DNA analyses per month, no credit card required
            </div>
          </div>

          {/* Pricing grid — 4 columns on xl, 2 on md, 1 on sm */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col glass-card rounded-2xl p-6 border ${plan.accentColor} transition-all duration-200 hover:shadow-lg
                  ${plan.id === 'advisor' ? 'ring-1 ring-purple-500/30 shadow-purple-500/10 shadow-xl' : ''}
                `}
              >
                {/* MOST POPULAR badge */}
                {plan.badge && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 ${plan.badgeColor} text-white text-xs font-bold px-3 py-1 rounded-full tracking-wider`}>
                    {plan.badge}
                  </div>
                )}

                {/* Plan name & price */}
                <div className="mb-6">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{plan.name}</p>
                  <div className="flex items-end gap-1 mb-3">
                    {plan.price === 0 ? (
                      <span className="text-4xl font-extrabold text-white">Free</span>
                    ) : (
                      <>
                        <span className="text-gray-400 text-lg self-start mt-1">$</span>
                        <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                        <span className="text-gray-500 text-sm mb-1">{plan.period}</span>
                      </>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">{plan.tagline}</p>
                </div>

                {/* CTA */}
                <Link
                  href={plan.ctaHref}
                  className={`${plan.ctaStyle} text-center text-sm py-3 mb-6 block`}
                >
                  {plan.ctaText}
                </Link>

                {/* Divider */}
                <div className="border-t border-gray-800/60 mb-5" />

                {/* Included features */}
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                  {plan.missing.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600 line-through">
                      <span className="text-gray-700 mt-0.5 shrink-0">✗</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* B2B / FAQ callout */}
          <div className="mt-16 text-center">
            <p className="text-gray-500 text-sm mb-2">Need a custom plan for your institution?</p>
            <Link href="/contact-sales" className="text-blue-400 hover:text-blue-300 text-sm underline underline-offset-4 transition-colors">
              Talk to our enterprise team →
            </Link>
          </div>
        </div>
      </main>

      {/* MAS Disclaimer */}
      <section className="border-t border-gray-800/60 py-8 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong className="text-gray-500">Regulatory Disclaimer:</strong> NeuFin provides financial data and analysis tools for informational and educational purposes only. This is not financial advice. Past performance does not indicate future results. All investments carry risk. Please consult a licensed financial advisor before making investment decisions. NeuFin operates in compliance with the Monetary Authority of Singapore (MAS) guidelines on fintech and data services.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-6 text-center text-sm text-gray-600">
        Neufin © {new Date().getFullYear()} · MAS-compliant · Powered by AI
      </footer>
    </div>
  )
}
