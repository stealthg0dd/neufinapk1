import Link from "next/link";

export const metadata = {
  title: "Help & tutorials | NeuFin",
  description:
    "Get started with NeuFin in 3 steps — portfolio upload, DNA score, and Swarm IC.",
};

const FAQ_ITEMS = [
  {
    q: "What file format do I need?",
    a: 'CSV with "ticker" and "shares" columns. Any broker export works — we auto-detect common formats. Download the CSV template at /csv-template.csv.',
  },
  {
    q: "Do I need to create an account?",
    a: "No account required for DNA analysis. An account is required for Swarm IC, PDF export, and saving history.",
  },
  {
    q: "How long does analysis take?",
    a: "DNA score: under 5 seconds. Swarm IC (7-agent Investment Committee): approximately 60 seconds.",
  },
  {
    q: "Is my portfolio data safe?",
    a: "Position data is processed in real time and not stored after analysis. EU data residency. No personally identifiable information required.",
  },
  {
    q: "What's the difference between DNA and Swarm IC?",
    a: "DNA is the behavioral diagnostic — 47 bias flags, concentration analysis, and investor archetype. Swarm IC is the full 7-agent Investment Committee briefing with exact trade recommendations, regime analysis, and a white-labeled PDF.",
  },
  {
    q: "Can I white-label the output?",
    a: "Yes on the Advisor tier ($299/mo). Your logo and brand colour on every PDF report.",
  },
];

export default function HelpTutorialsPage() {
  return (
    <div className="min-h-screen bg-app">
      <div className="page-container max-w-3xl py-10">

        {/* ── Hero ──────────────────────────────────────────── */}
        <p className="text-label text-primary">Help center</p>
        <h1 className="mt-2 font-sans text-3xl font-bold text-navy">
          Get started in 3 steps
        </h1>
        <p className="mt-2 text-readable">
          Most users complete their first analysis in under 60 seconds.
        </p>

        {/* ── Step cards ────────────────────────────────────── */}
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {/* Step 1 */}
          <div className="rounded-xl border border-border bg-surface-2 p-6 flex flex-col gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1EB8CC]/15 text-[#1EB8CC] font-bold text-sm">
              1
            </div>
            <h2 className="font-semibold text-navy text-base">Upload your portfolio</h2>
            <p className="text-sm text-readable leading-relaxed">
              Export a CSV from your broker with ticker symbols and quantities.
              No login required for your first analysis.
            </p>
            <div className="mt-auto">
              <Link href="/upload" className="text-sm font-medium text-[#1EB8CC] hover:underline">
                Try it now →
              </Link>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-xl border border-border bg-surface-2 p-6 flex flex-col gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1EB8CC]/15 text-[#1EB8CC] font-bold text-sm">
              2
            </div>
            <h2 className="font-semibold text-navy text-base">Get your DNA score</h2>
            <p className="text-sm text-readable leading-relaxed">
              Our engine runs 47 behavioral bias checks in real time. You&apos;ll see
              your score, investor archetype, and correction-exit risk level.
            </p>
            <div className="mt-auto">
              <Link href="/sample/dna-report" className="text-sm font-medium text-[#1EB8CC] hover:underline">
                See sample →
              </Link>
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-xl border border-border bg-surface-2 p-6 flex flex-col gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1EB8CC]/15 text-[#1EB8CC] font-bold text-sm">
              3
            </div>
            <h2 className="font-semibold text-navy text-base">Run the 7-agent Swarm IC</h2>
            <p className="text-sm text-readable leading-relaxed">
              Unlock a full Investment Committee briefing — regime analysis, tax
              recommendations, alpha signals, and a white-labeled PDF memo.
            </p>
            <div className="mt-auto">
              <Link href="/sample/ic-memo" className="text-sm font-medium text-[#1EB8CC] hover:underline">
                See IC memo sample →
              </Link>
            </div>
          </div>
        </div>

        {/* ── Video placeholder ──────────────────────────────── */}
        <div className="mt-14">
          <h2 className="text-lg font-semibold text-navy mb-4">
            Watch: 60-second portfolio analysis
          </h2>
          <div className="relative flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2 py-16 px-8 text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1EB8CC]/15">
              <svg className="h-6 w-6 text-[#1EB8CC]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-navy">Demo video coming soon</p>
            <p className="text-sm text-readable">Try the live analysis instead</p>
            <Link
              href="/upload"
              className="mt-2 inline-block rounded-lg bg-[#1EB8CC] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1EB8CC]/90 transition-colors"
            >
              Analyze my portfolio — free →
            </Link>
          </div>
        </div>

        {/* ── FAQ ───────────────────────────────────────────── */}
        <div className="mt-14">
          <h2 className="text-lg font-semibold text-navy mb-6">Frequently asked questions</h2>
          <div className="space-y-4">
            {FAQ_ITEMS.map((item, i) => (
              <details key={i} className="group rounded-xl border border-border bg-surface-2">
                <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-semibold text-navy list-none">
                  {item.q}
                  <span className="ml-4 shrink-0 text-readable transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="px-5 pb-5 pt-1 text-sm text-readable leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* ── Bottom CTA ────────────────────────────────────── */}
        <div className="mt-14 rounded-xl border border-[#1EB8CC]/30 bg-[#1EB8CC]/5 px-8 py-10 text-center">
          <h2 className="text-xl font-bold text-navy">
            Ready to see your portfolio&apos;s behavioral fingerprint?
          </h2>
          <p className="mt-2 text-sm text-readable">
            Upload a CSV in seconds. No account required.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/upload"
              className="rounded-lg bg-[#1EB8CC] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#1EB8CC]/90 transition-colors"
            >
              Start free analysis
            </Link>
            <Link
              href="/sample/ic-memo"
              className="rounded-lg border border-border bg-surface-2 px-6 py-2.5 text-sm font-semibold text-navy hover:bg-surface transition-colors"
            >
              See sample output
            </Link>
          </div>
        </div>

        <p className="mt-10 text-sm text-readable">
          <Link href="/" className="font-medium text-primary-dark hover:underline">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
