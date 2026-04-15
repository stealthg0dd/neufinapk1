import Link from "next/link";
import Image from "next/image";

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-shell-deep text-shell-fg">
      {/* Nav */}
      <nav className="border-b border-shell-border/60 sticky top-0 z-10 bg-shell-deep/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-gradient">
            NeuFin
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/blog"
              className="text-shell-muted hover:text-shell-fg transition-colors"
            >
              Blog
            </Link>
            <Link
              href="/features"
              className="text-shell-muted hover:text-shell-fg transition-colors"
            >
              Features
            </Link>
            <Link href="/pricing" className="btn-primary py-1.5 px-4 text-sm">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-section">{children}</main>

      {/* Footer */}
      <footer className="border-t border-shell-border mt-16">
        <div className="max-w-3xl mx-auto px-6 py-section flex flex-wrap items-center justify-between gap-4">
          <div>
            <Image
              src="/logo.png"
              alt="NeuFin"
              width={90}
              height={26}
              className="h-6 w-auto mb-3 opacity-80"
            />
            <p className="text-xs text-shell-subtle mt-1">
              Behavioral finance intelligence for SEA SMEs · Founded 2025 ·
              Singapore
            </p>
          </div>
          <div className="flex gap-4 text-xs text-shell-subtle">
            <Link
              href="/features"
              className="hover:text-shell-fg/90 transition-colors"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              className="hover:text-shell-fg/90 transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/research"
              className="hover:text-shell-fg/90 transition-colors"
            >
              Research
            </Link>
            <Link
              href="/blog"
              className="hover:text-shell-fg/90 transition-colors"
            >
              Blog
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
