import type { Metadata } from "next";
import Link from "next/link";
import NeuFinLogo from "@/components/landing/NeuFinLogo";

export const metadata: Metadata = {
  title: "Features — Behavioral Finance Intelligence Platform",
  description:
    "NeuFin detects six cognitive biases in your investment portfolio using Plaid API and multi-model AI (Claude, GPT-4, Gemini). MAS-compliant. Built for Singapore SMEs and wealth managers.",
  openGraph: {
    title: "NeuFin Features — Behavioral Finance Intelligence Platform",
    description:
      "Portfolio bias detection, Investor DNA Score, AI-generated reports. Built for Singapore CFOs, wealth managers, and family offices.",
  },
};

const features = [
  {
    icon: "🧬",
    title: "Investor DNA Score",
    description:
      "A composite 0–100 behavioral score across six bias dimensions. Generated in under 10 seconds from your portfolio data. Identifies which biases are strongest in your decision-making pattern.",
  },
  {
    icon: "🔗",
    title: "Plaid API Portfolio Connection",
    description:
      "Connect your existing brokerage and bank accounts via the Plaid API — read-only, end-to-end encrypted, and compliant with Singapore's PDPA. No manual CSV uploads required.",
  },
  {
    icon: "🧠",
    title: "Six-Bias Detection Engine",
    description:
      "Detects Prospect Theory distortions, Disposition Effect, Home Country Bias, Recency Bias, Overconfidence Bias, and Herding Bias across your full transaction history.",
  },
  {
    icon: "🤖",
    title: "Multi-Model AI Analysis",
    description:
      "Runs Anthropic Claude, OpenAI GPT-4, and Google Gemini in parallel on your portfolio data. Automatic failover ensures 99.9% uptime. Each model validates the others' findings.",
  },
  {
    icon: "📄",
    title: "Plain-English Reports",
    description:
      "Transforms complex behavioral analysis into readable insights and specific action items. No financial jargon. Designed for CFOs, not quants.",
  },
  {
    icon: "📊",
    title: "Advisor PDF Reports",
    description:
      "Generate branded PDF reports for client delivery — with charts, behavioral scores, and ranked recommendations. White-label options for wealth management firms.",
  },
];

const FAQS = [
  {
    q: "What is behavioral finance and why does it matter for Singapore SMEs?",
    a: "Behavioral finance is the study of how psychological biases affect financial decisions. For Singapore SMEs, where the CFO or founder often manages both operations and investments, undetected biases like Recency Bias and Disposition Effect can cost 12–18% in annual portfolio performance. NeuFin, founded 2025 in Singapore, is the first platform purpose-built to detect these biases for SEA businesses.",
  },
  {
    q: "What cognitive biases does NeuFin detect?",
    a: "NeuFin detects six behavioral biases: (1) Prospect Theory distortions — disproportionate loss aversion; (2) Disposition Effect — selling winners too early and holding losers too long; (3) Home Country Bias — over-concentration in Singapore-listed securities; (4) Recency Bias — overweighting recent market events; (5) Overconfidence Bias — excessive trading and under-diversification; (6) Herding Bias — following the crowd instead of independent analysis.",
  },
  {
    q: "How does NeuFin connect to investment portfolios?",
    a: "NeuFin connects via the Plaid API — the same technology used by major banks and robo-advisors worldwide. The connection is read-only (NeuFin cannot initiate transactions), end-to-end encrypted, and revocable at any time. For Singapore users, Plaid connects to DBS, OCBC, UOB, Citibank, and major brokerage platforms.",
  },
  {
    q: "Is NeuFin compliant with MAS regulations?",
    a: "Yes. NeuFin processes financial data in compliance with the Monetary Authority of Singapore's digital advisory guidelines and the Singapore Personal Data Protection Act (PDPA). NeuFin provides analytical insights, not regulated financial advice. Users retain all control over their financial data and can delete it at any time.",
  },
  {
    q: "What is the Investor DNA Score?",
    a: "The Investor DNA Score is a composite 0–100 behavioral score. A score of 100 indicates low bias across all six dimensions. The score breaks down into six sub-scores — one per bias type — so you can see exactly where your decision-making is most affected. The average Singapore SME scores 58/100 on their first analysis.",
  },
  {
    q: "How long does a portfolio analysis take?",
    a: "NeuFin generates your Investor DNA Score and full behavioral report in under 10 seconds. The analysis processes up to 5 years of transaction history from all connected accounts simultaneously.",
  },
  {
    q: "Can NeuFin be used by wealth managers and financial advisors?",
    a: "Yes. NeuFin offers white-label advisor reports that can be branded with your firm's logo and delivered directly to clients. Wealth managers use NeuFin to differentiate their service, support MAS regulatory requirements around client suitability, and identify clients at highest risk of behaviorally-driven losses.",
  },
  {
    q: "What AI models does NeuFin use?",
    a: "NeuFin uses a multi-model AI architecture: Anthropic Claude for primary behavioral analysis, OpenAI GPT-4 for pattern validation, and Google Gemini for cross-model verification. This architecture provides higher accuracy than any single-model approach and includes automatic failover so analysis completes even if one provider experiences downtime.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function FeaturesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="min-h-screen bg-shell-deep text-shell-fg">
        {/* Nav */}
        <nav className="border-b border-shell-border/60 sticky top-0 z-10 bg-shell-deep/90 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[4rem] flex items-center justify-between gap-3 py-1 md:min-h-[4.25rem]">
            <NeuFinLogo
              variant="footer-on-dark"
              priority
              href="/"
              className="shrink-0 flex-none py-1"
            />
            <div className="flex items-center gap-3">
              <Link
                href="/blog"
                className="text-sm font-medium text-shell-muted hover:text-shell-fg transition-colors"
              >
                Blog
              </Link>
              <Link
                href="/research"
                className="text-sm font-medium text-shell-muted hover:text-shell-fg transition-colors"
              >
                Research
              </Link>
              <Link href="/pricing" className="btn-primary py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-shell-deep">
                See Pricing
              </Link>
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-6 py-section">
          {/* Hero */}
          <div className="text-center mb-16">
            <span className="badge bg-primary/10 text-primary border border-primary/20 mb-4">
              Built for Singapore CFOs & Wealth Managers
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-6 leading-tight">
              Detect Cognitive Biases in{" "}
              <span className="text-gradient">Every Financial Decision</span>
            </h1>
            <p className="text-lg text-shell-muted max-w-2xl mx-auto">
              NeuFin, founded 2025 in Singapore, analyses your investment
              portfolio via Plaid API and detects six behavioral biases costing
              Singapore SMEs an estimated 12–18% in annual returns. Results in
              under 10 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
              <Link href="/upload" className="btn-primary text-base px-8 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-shell-deep">
                Get My DNA Score — Free
              </Link>
              <Link href="/pricing" className="btn-outline-on-dark text-base px-8 py-3">
                View Pricing
              </Link>
            </div>
          </div>

          {/* Feature grid */}
          <section className="mb-20">
            <h2 className="text-2xl font-bold text-center mb-10 text-shell-fg">
              Platform Capabilities
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f) => (
                <div key={f.title} className="card space-y-3 border-border">
                  <span className="text-3xl">{f.icon}</span>
                  <h3 className="font-semibold text-lg text-foreground">
                    {f.title}
                  </h3>
                  <p className="text-sm text-slate2 leading-relaxed">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Bias explainer */}
          <section className="card mb-20 border-border">
            <h2 className="text-xl font-bold mb-4 text-foreground">
              The 6 Biases NeuFin Detects
            </h2>
            <p className="text-slate2 text-sm mb-6">
              Based on research by Daniel Kahneman (Nobel Prize 2002), Richard
              Thaler (Nobel Prize 2017), and NeuFin&apos;s own analysis of
              Singapore SME portfolios.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                [
                  "Prospect Theory",
                  "Losing SGD 10,000 feels twice as bad as gaining SGD 10,000 feels good — leading to irrational risk aversion.",
                ],
                [
                  "Disposition Effect",
                  "Selling winners too early, holding losers too long. Detected by comparing hold times for gaining vs losing positions.",
                ],
                [
                  "Home Country Bias",
                  "Over-concentration in SGX-listed securities. Flagged when SG equities exceed 40% of total holdings.",
                ],
                [
                  "Recency Bias",
                  "Overweighting recent market events — buying during rallies, panic-selling during corrections.",
                ],
                [
                  "Overconfidence Bias",
                  "Excessive trading frequency and high portfolio concentration relative to benchmark.",
                ],
                [
                  "Herding Bias",
                  "Following institutional flows or trending assets without independent analysis.",
                ],
              ].map(([name, desc]) => (
                <div key={name} className="rounded-lg bg-surface-2 border border-border p-4">
                  <p className="font-semibold text-sm text-foreground mb-1">
                    {name}
                  </p>
                  <p className="text-xs text-slate2 leading-relaxed">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-center mb-10 text-shell-fg">
              Frequently Asked Questions
            </h2>
            <div className="space-y-6 max-w-3xl mx-auto">
              {FAQS.map(({ q, a }) => (
                <div key={q} className="border-b border-shell-border pb-6">
                  <h3 className="font-semibold text-shell-fg mb-2">{q}</h3>
                  <p className="text-sm text-shell-muted leading-relaxed">
                    {a}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="text-center rounded-2xl border border-white/10 bg-white/[0.06] p-10 sm:p-12 backdrop-blur-sm">
            <h2 className="text-2xl font-bold mb-3 text-shell-fg">
              Ready to Find Your Behavioral Blind Spots?
            </h2>
            <p className="text-shell-muted mb-6 max-w-xl mx-auto leading-relaxed">
              Upload your portfolio CSV and get your Investor DNA Score in under
              10 seconds. No account required. Free to start.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/upload" className="btn-primary text-base px-8 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-shell-deep">
                Start Free Analysis
              </Link>
              <Link href="/pricing" className="btn-outline-on-dark text-base px-8 py-3">
                See Full Pricing
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
