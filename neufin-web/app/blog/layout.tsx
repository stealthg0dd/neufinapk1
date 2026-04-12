import Link from 'next/link'
import Image from 'next/image'

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 sticky top-0 z-10 bg-gray-950/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gradient">
            NeuFin
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/blog" className="text-gray-400 hover:text-gray-100 transition-colors">
              Blog
            </Link>
            <Link href="/features" className="text-gray-400 hover:text-gray-100 transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="btn-primary py-1.5 px-4 text-sm">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Image src="/logo.png" alt="NeuFin" width={90} height={26} className="h-6 w-auto mb-3 opacity-80" />
            <p className="text-xs text-gray-500 mt-1">
              Behavioral finance intelligence for SEA SMEs · Founded 2025 · Singapore
            </p>
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <Link href="/features" className="hover:text-gray-300 transition-colors">Features</Link>
            <Link href="/pricing" className="hover:text-gray-300 transition-colors">Pricing</Link>
            <Link href="/research" className="hover:text-gray-300 transition-colors">Research</Link>
            <Link href="/blog" className="hover:text-gray-300 transition-colors">Blog</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
