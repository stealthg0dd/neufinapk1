import Link from 'next/link'

export default function Footer() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="text-xl font-semibold text-foreground md:text-2xl">
          IC-grade portfolio intelligence in 60 seconds. No terminals. No analysts. No waiting.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/upload"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Analyze My Portfolio Free
          </Link>
          <Link
            href="/contact-sales"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            Book a Demo
          </Link>
        </div>
        <div className="mt-8 border-t border-border/40 pt-6">
          <div className="grid grid-cols-1 gap-4 text-[11px] text-muted-foreground/60 md:grid-cols-2">
            <div className="text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40">
                REGISTERED ENTITIES
              </p>
              <p>
                NeuFin OÜ · Harju maakond, Tallinn, Kesklinna linnaosa, Vesivärva tn 50-201, 10152 · Registered in
                Estonia (EU)
              </p>
              <p>Neufin Inc. — Registered office, United States</p>
              <p>Singapore · Malaysia · UAE · Thailand · Vietnam (Coming 2026)</p>
            </div>
            <div className="text-left md:text-right">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40">LEGAL</p>
              <p>© 2026 Neufin OÜ. All rights reserved.</p>
              <p>info@neufin.ai · www.neufin.ai</p>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                <a href="/terms-and-conditions" className="underline hover:text-muted-foreground/80">
                  Terms of Service
                </a>
                <a href="/privacy" className="underline hover:text-muted-foreground/80">
                  Privacy Policy
                </a>
                <a
                  href="https://status.neufin.ai"
                  className="underline hover:text-muted-foreground/80"
                  target="_blank"
                  rel="noreferrer"
                >
                  Status
                </a>
                <Link href="/partners" className="underline hover:text-muted-foreground/80">
                  API Docs
                </Link>
              </p>
            </div>
          </div>

          <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground/40">
            NeuFin provides financial data and portfolio analysis tools for informational purposes only. This is not
            investment advice, and no output from NeuFin constitutes a recommendation to buy, sell, or hold any
            security. Past performance does not indicate future results. NeuFin aligns with MAS guidelines on fintech
            and data services.
          </p>
        </div>
      </div>
    </section>
  )
}
