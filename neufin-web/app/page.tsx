'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { motion, useInView } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import GlobalChatWidget from '@/components/GlobalChatWidget'

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
