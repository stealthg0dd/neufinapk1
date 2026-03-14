import Link from 'next/link'

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
  { value: '< 10s', label: 'Analysis time' },
  { value: '4 AI', label: 'Models with fallback' },
  { value: '100%', label: 'Privacy — no account needed' },
]

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
            <Link href="/dashboard" className="btn-primary py-2 text-sm">
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-3xl">
          <span className="badge bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-6">
            AI Portfolio Intelligence
          </span>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            Discover Your{' '}
            <span className="text-gradient">Investor DNA</span>
          </h1>
          <p className="text-lg text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed">
            Upload your portfolio CSV and get an AI-generated behavioral profile — understand your
            biases, strengths, and exactly what to do next.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/upload" className="btn-primary text-base px-8 py-4">
              Get My DNA Score →
            </Link>
            <Link href="/dashboard" className="btn-outline text-base px-8 py-4">
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-800/60 py-10">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-gradient">{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Built for modern investors
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="card hover:border-blue-800/60 transition-colors">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto text-center card border-blue-800/40 bg-gradient-to-br from-blue-950/60 to-purple-950/40">
          <h2 className="text-2xl font-bold mb-3">Ready to know yourself as an investor?</h2>
          <p className="text-gray-400 mb-6">No account required. Upload a CSV, get results in seconds.</p>
          <Link href="/upload" className="btn-primary inline-block">
            Start for free →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-6 text-center text-sm text-gray-600">
        Neufin © {new Date().getFullYear()} · For informational purposes only · Not financial advice
      </footer>
    </div>
  )
}
