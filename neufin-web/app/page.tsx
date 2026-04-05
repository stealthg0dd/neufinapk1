'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { motion, useInView } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useRef, useState, useEffect } from 'react'
import GlobalChatWidget from '@/components/GlobalChatWidget'
import { useAuth } from '@/lib/auth-context'

const features = [
  {
    icon: '🧬',
    title: 'Investor DNA Score',
    desc: 'Get a 0–100 score revealing your behavioral investing patterns and cognitive biases.',
  },
  {
    icon: '🤖',
    title: 'Multi-Model AI',
    desc: 'Claude, Gemini, and GPT-4 analyze your holdings for institutional-grade insights.',
  },
  {
    icon: '📊',
    title: 'Advisor Reports',
    desc: 'Generate professional PDF reports for clients with charts, signals, and recommendations.',
  },
]

const investorSteps = [
  { step: '1', label: 'Upload your portfolio CSV' },
  { step: '2', label: 'Receive your DNA score & analysis' },
  { step: '3', label: 'Save to vault — or buy the full PDF' },
]

const advisorSteps = [
  { step: '1', label: 'Sign up & add your firm branding' },
  { step: '2', label: 'Upload any client portfolio' },
  { step: '3', label: 'Download a white-label PDF report' },
]

const stats = [
  { value: 10,    suffix: 's',   label: 'Analysis time' },
  { value: 4,     suffix: ' AI', label: 'Models with fallback' },
  { value: 100,   suffix: '%',   label: 'Privacy — no account needed' },
]

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200, active = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!active) return
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration, active])
  return count
}

// ── Animated stat card ────────────────────────────────────────────────────────
function StatCard({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const count  = useCountUp(value, 1000, inView)

  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl font-bold text-gradient">
        {value === 10 ? `< ${count}` : count}{suffix}
      </p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  )
}

// ── Animation variants ────────────────────────────────────────────────────────
const fadeUp = {
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}

const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.12 } },
}

const springScale = {
  hidden:  { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 20 } },
}

export default function LandingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  // Redirect logged-in users to dashboard — landing page is for unauthenticated visitors.
  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [loading, user, router])

  // Avoid flash of landing content while redirect is in flight.
  if (!loading && user) return null

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 backdrop-blur-sm sticky top-0 z-10 bg-gray-950/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-gradient">Neufin</span>
          <div className="flex items-center gap-3">
            <Link href="/upload" className="btn-outline py-2 text-sm">
              DNA Score
            </Link>
            <Link href="/swarm" className="btn-outline py-2 text-sm">
              Swarm
            </Link>
            <Link href="/pricing" className="btn-outline py-2 text-sm">
              Pricing
            </Link>
            <Link href="/advisor/dashboard" className="btn-outline py-2 text-sm">
              For Advisors
            </Link>
            <Link href="/dashboard" className="btn-primary py-2 text-sm">
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 relative overflow-hidden">
        {/* Animated background glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute top-1/2 left-1/2 w-[700px] h-[700px] rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(147,51,234,0.08) 60%, transparent 100%)',
              animation: 'float-bg 8s ease-in-out infinite',
            }}
          />
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="relative max-w-3xl"
        >
          <motion.span variants={fadeUp} className="badge bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-6 inline-block">
            AI Portfolio Intelligence
          </motion.span>

          <motion.h1 variants={fadeUp} className="text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            Discover Your{' '}
            <span className="text-gradient">Investor DNA</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="text-lg text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed">
            Upload your portfolio CSV and get an AI-generated behavioral profile — understand your
            biases, strengths, and exactly what to do next.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/upload" className="btn-primary text-base px-8 py-4">
              Get My DNA Score →
            </Link>
            <Link href="/dashboard" className="btn-outline text-base px-8 py-4">
              View Dashboard
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-800/60 py-10">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 gap-6">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="text-3xl font-bold text-center mb-12"
          >
            Built for modern investors
          </motion.h2>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid md:grid-cols-3 gap-6"
          >
            {features.map((f) => (
              <motion.div
                key={f.title}
                variants={springScale}
                className="glass-card rounded-xl p-5 hover:border-blue-500/30 transition-all duration-200 hover:shadow-blue-500/10 hover:shadow-lg cursor-default"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Two-track user journey ──────────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-gray-800/60">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="text-3xl font-bold text-center mb-3"
          >
            Who is Neufin for?
          </motion.h2>
          <motion.p
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="text-gray-400 text-center mb-12"
          >
            Two journeys, one platform. Pick yours.
          </motion.p>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid md:grid-cols-2 gap-6"
          >
            {/* Retail Investor Card */}
            <motion.div
              variants={springScale}
              className="glass-card rounded-2xl p-8 flex flex-col gap-6 border-blue-500/20 hover:border-blue-500/40 transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl">🧬</div>
                <div>
                  <p className="text-xs text-blue-400 font-medium uppercase tracking-wider">Retail Investor</p>
                  <h3 className="text-lg font-bold">Understand your own portfolio</h3>
                </div>
              </div>
              <ol className="space-y-3">
                {investorSteps.map(({ step, label }) => (
                  <li key={step} className="flex items-center gap-3 text-sm text-gray-300">
                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">{step}</span>
                    {label}
                  </li>
                ))}
              </ol>
              <div className="mt-auto flex flex-col gap-2">
                <Link href="/upload" className="btn-primary text-sm text-center py-3">
                  Get My DNA Score — Free →
                </Link>
                {/* Updated: direct to onboarding */}
                <Link href="/onboarding" className="btn-primary text-sm text-center py-3 mt-2">
                  Start Onboarding →
                </Link>
                <p className="text-xs text-gray-500 text-center">No account required · results in &lt; 10 s</p>
              </div>
            </motion.div>

            {/* Financial Advisor Card */}
            <motion.div
              variants={springScale}
              className="glass-card rounded-2xl p-8 flex flex-col gap-6 border-purple-500/20 hover:border-purple-500/40 transition-all duration-200"
              style={{ background: 'linear-gradient(135deg, rgba(88,28,135,0.15) 0%, rgba(30,58,138,0.1) 100%)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-xl">💼</div>
                <div>
                  <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">Financial Advisor</p>
                  <h3 className="text-lg font-bold">White-label reports for clients</h3>
                </div>
              </div>
              <ol className="space-y-3">
                {advisorSteps.map(({ step, label }) => (
                  <li key={step} className="flex items-center gap-3 text-sm text-gray-300">
                    <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">{step}</span>
                    {label}
                  </li>
                ))}
              </ol>
              <div className="mt-auto flex flex-col gap-2">
                <Link href="/auth?next=/onboarding&user_type=advisor" className="btn-outline border-purple-500/40 text-purple-300 hover:bg-purple-500/10 text-sm text-center py-3 rounded-xl">
                  Start as an Advisor →
                </Link>
                <p className="text-xs text-gray-500 text-center">$99 / mo for unlimited reports</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* B2B Singapore Section ─────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-gray-800/60">
        <div className="max-w-5xl mx-auto">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="text-center mb-12"
          >
            <motion.span variants={fadeUp} className="badge bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-4 inline-block">
              For Financial Professionals
            </motion.span>
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold mb-3">
              Built for Singapore&apos;s{' '}
              <span className="text-gradient">Financial Professionals</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-gray-400 max-w-xl mx-auto">
              MAS-compliant behavioral finance intelligence that your clients will pay for.
            </motion.p>
          </motion.div>

          {/* Three proof points */}
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid md:grid-cols-3 gap-5 mb-12"
          >
            {[
              { icon: '⚡', title: '60-second analysis', desc: 'Portfolio DNA analysis delivered in under a minute — no waiting, no batch processing.' },
              { icon: '📄', title: 'Goldman-quality reports', desc: 'Professional white-label PDF reports your clients expect from a top-tier advisory.' },
              { icon: '🏷️', title: 'Your brand, our intelligence', desc: 'White-label NeuFin for your practice. Your logo, your colors, your client relationships.' },
            ].map((p) => (
              <motion.div
                key={p.title}
                variants={springScale}
                className="glass-card rounded-xl p-6 border border-purple-500/10 hover:border-purple-500/30 transition-all duration-200"
              >
                <div className="text-3xl mb-3">{p.icon}</div>
                <h3 className="font-semibold text-white mb-2">{p.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Social proof + CTA */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center"
          >
            <p className="text-gray-500 text-sm mb-6">
              Join <strong className="text-gray-300">50+ advisors</strong> across Singapore and Southeast Asia
            </p>
            <Link href="/pricing" className="btn-primary inline-block px-8 py-4 text-base">
              Start Your Free Advisor Trial →
            </Link>
          </motion.div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-16 px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center glass-card rounded-2xl p-10 border-blue-800/40"
          style={{ background: 'linear-gradient(135deg, rgba(30,58,138,0.3) 0%, rgba(88,28,135,0.2) 100%)' }}
        >
          <h2 className="text-2xl font-bold mb-3">Ready to know yourself as an investor?</h2>
          <p className="text-gray-400 mb-6">No account required. Upload a CSV, get results in seconds.</p>
          <Link href="/upload" className="btn-primary inline-block">
            Start for free →
          </Link>
          {/* Updated: direct to onboarding */}
          <Link href="/onboarding" className="btn-primary inline-block mt-2">
            Start Onboarding →
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-6 text-center text-sm text-gray-600">
        Neufin © {new Date().getFullYear()} · For informational purposes only · Not financial advice
      </footer>

      {/* Floating market-intelligence chatbot */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 1.2 }}
      >
        <Suspense fallback={null}>
          <GlobalChatWidget />
        </Suspense>
      </motion.div>
    </div>
  )
}
