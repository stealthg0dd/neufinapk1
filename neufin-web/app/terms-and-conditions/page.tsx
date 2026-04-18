import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms and Conditions | NeuFin",
  description:
    "NeuFin Terms and Conditions — covering platform usage, not-investment-advice disclaimers, API rights, data uploads, and governing law.",
};

const SECTIONS = [
  { id: "acceptance", title: "1. Acceptance of Terms" },
  { id: "services", title: "2. Our Services" },
  { id: "not-advice", title: "3. Not Investment Advice" },
  { id: "accounts", title: "4. User Accounts and Eligibility" },
  { id: "obligations", title: "5. User Obligations and Data Uploads" },
  { id: "ip", title: "6. Intellectual Property" },
  { id: "api", title: "7. API and Partner Usage" },
  { id: "privacy", title: "8. Privacy and Data Protection" },
  { id: "disclaimers", title: "9. Disclaimers" },
  { id: "liability", title: "10. Limitation of Liability" },
  { id: "indemnification", title: "11. Indemnification" },
  { id: "termination", title: "12. Termination" },
  { id: "governing-law", title: "13. Governing Law and Dispute Resolution" },
  { id: "changes", title: "14. Changes to Terms" },
  { id: "misc", title: "15. Miscellaneous" },
  { id: "contact", title: "Contact" },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top nav strip ── */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="font-mono text-sm font-bold tracking-wider text-foreground"
          >
            NEUFIN
          </Link>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <Link
              href="/pricing"
              className="transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/partners"
              className="transition-colors hover:text-foreground"
            >
              Partners
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Notice banner ── */}
      <div className="border-b border-primary/20 bg-primary/5 py-3 text-center">
        <p className="text-sm text-muted-foreground">
          These Terms were last updated on{" "}
          <span className="font-semibold text-foreground">April 11, 2026</span>.
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-section">
        <div className="flex gap-12">
          {/* ── Left ToC — desktop only ── */}
          <aside className="hidden w-64 shrink-0 xl:block">
            <div className="sticky top-24">
              <p className="mb-4 font-mono text-sm uppercase tracking-widest text-muted-foreground/60">
                Table of Contents
              </p>
              <nav className="space-y-1">
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    {s.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="min-w-0 flex-1">
            <div className="mb-8">
              <h1 className="mb-2 text-4xl font-bold text-foreground">
                Terms and Conditions
              </h1>
              <p className="text-sm text-muted-foreground">
                Last Updated: April 11, 2026
              </p>
            </div>

            <div className="prose prose-slate max-w-none space-y-10 text-[15px] leading-relaxed text-gray-700">
              <section id="acceptance">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  1. Acceptance of Terms
                </h2>
                <p>
                  By accessing or using the NeuFin website, Swarm Terminal, API
                  services, or any related tools (collectively, the
                  &ldquo;Services&rdquo;), you agree to be bound by these Terms
                  and Conditions (&ldquo;Terms&rdquo;). If you do not agree, you
                  must not use the Services.
                </p>
              </section>

              <section id="services">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  2. Our Services
                </h2>
                <p>
                  NeuFin provides an AI-powered portfolio intelligence platform
                  consisting of a 7-agent swarm that generates behavioral DNA
                  scores, market regime analysis, risk assessments, tax
                  optimization insights, alpha opportunities, and Investment
                  Committee-grade briefing memos (collectively,
                  &ldquo;Reports&rdquo;). Reports are delivered via web
                  dashboard, PDF export, or API integration. Services are
                  provided on an &ldquo;as-is&rdquo; and
                  &ldquo;as-available&rdquo; basis.
                </p>
              </section>

              <section id="not-advice">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  3. Not Investment Advice
                </h2>
                <p className="mb-4 rounded-lg border border-risk/30 bg-risk/5 p-4 text-foreground">
                  ALL REPORTS, ANALYSES, SCORES, RECOMMENDATIONS, AND CONTENT
                  GENERATED BY NEUFIN ARE FOR INFORMATIONAL AND EDUCATIONAL
                  PURPOSES ONLY.
                </p>
                <p>
                  NeuFin does not provide investment, financial, tax, legal, or
                  accounting advice. No Report constitutes a recommendation to
                  buy, sell, hold, or otherwise transact in any security or
                  financial instrument. You are solely responsible for your own
                  investment decisions and must consult a qualified licensed
                  professional before acting on any information provided by
                  NeuFin. NeuFin and its agents shall have no liability for any
                  loss or damage arising from your reliance on any Report.
                </p>
              </section>

              <section id="accounts">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  4. User Accounts and Eligibility
                </h2>
                <p>
                  You must be at least 18 years old and have full legal capacity
                  to use the Services. You are responsible for maintaining the
                  confidentiality of your account credentials and for all
                  activities conducted under your account.
                </p>
              </section>

              <section id="obligations">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  5. User Obligations and Data Uploads
                </h2>
                <ul className="ml-6 mt-3 list-disc space-y-2">
                  <li>
                    You represent that all portfolio data (CSV files, holdings,
                    cost basis, etc.) you upload is accurate, complete, and
                    lawfully obtained.
                  </li>
                  <li>
                    You grant NeuFin a limited, non-exclusive, royalty-free
                    license to process your data solely to generate Reports and
                    improve the Services.
                  </li>
                  <li>
                    NeuFin does not store your full portfolio data beyond what
                    is necessary for the current analysis unless you explicitly
                    opt in to persistent storage (Enterprise plans only).
                  </li>
                  <li>
                    You must not upload data that violates any law or
                    third-party rights.
                  </li>
                </ul>
              </section>

              <section id="ip">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  6. Intellectual Property
                </h2>
                <ul className="ml-6 mt-3 list-disc space-y-2">
                  <li>
                    NeuFin owns all right, title, and interest in the Services,
                    underlying AI agents, algorithms, and platform technology.
                  </li>
                  <li>
                    You are granted a limited, non-transferable, revocable
                    license to use the Reports for your internal business or
                    personal investment purposes.
                  </li>
                  <li>
                    You may not resell, redistribute, or commercially exploit
                    any Report without explicit written permission (white-label
                    rights are available only under paid Enterprise/API plans).
                  </li>
                  <li>
                    All white-labeled Reports must retain NeuFin&apos;s
                    copyright notice unless otherwise agreed in writing.
                  </li>
                </ul>
              </section>

              <section id="api">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  7. API and Partner Usage
                </h2>
                <p>
                  Enterprise and API users are subject to additional terms in
                  the applicable Service Order or API Agreement, including rate
                  limits, uptime commitments, and usage-based billing.
                  Unauthorized API access is strictly prohibited.
                </p>
              </section>

              <section id="privacy">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  8. Privacy and Data Protection
                </h2>
                <p>
                  Your use of the Services is also governed by our{" "}
                  <Link
                    href="/privacy"
                    className="text-primary underline hover:text-primary/80"
                  >
                    Privacy Policy
                  </Link>
                  . NeuFin complies with GDPR (as NeuFin OÜ), Singapore PDPA/MAS
                  guidelines, and applicable data protection laws. We maintain
                  SOC 2 Type II controls where required for Enterprise users.
                </p>
              </section>

              <section id="disclaimers">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  9. Disclaimers
                </h2>
                <p>
                  The Services are provided &ldquo;AS IS&rdquo; without
                  warranties of any kind. NeuFin does not warrant that Reports
                  will be error-free, accurate, timely, or suitable for any
                  particular purpose. Market data is sourced from third parties
                  (Polygon.io, Finnhub, FRED, etc.) and may contain
                  inaccuracies. AI outputs are model-assisted and subject to
                  inherent limitations.
                </p>
              </section>

              <section id="liability">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  10. Limitation of Liability
                </h2>
                <p className="rounded-lg border border-border/50 bg-surface/50 p-4">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEUFIN AND ITS
                  AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
                  SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF
                  PROFITS OR INVESTMENT LOSSES, EVEN IF ADVISED OF THE
                  POSSIBILITY. NEUFIN&apos;S TOTAL LIABILITY SHALL NOT EXCEED
                  THE FEES PAID BY YOU IN THE TWELVE (12) MONTHS PRECEDING THE
                  CLAIM.
                </p>
              </section>

              <section id="indemnification">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  11. Indemnification
                </h2>
                <p>
                  You agree to indemnify, defend, and hold harmless NeuFin, its
                  officers, directors, employees, and agents from any claims,
                  losses, or damages arising from: (i) your use of the Services,
                  (ii) your investment decisions, (iii) any data you upload, or
                  (iv) your breach of these Terms.
                </p>
              </section>

              <section id="termination">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  12. Termination
                </h2>
                <p>
                  NeuFin may suspend or terminate your access at any time for
                  breach of these Terms or for any other reason. Upon
                  termination, your right to use the Services ceases
                  immediately. Paid subscriptions are non-refundable except as
                  required by law.
                </p>
              </section>

              <section id="governing-law">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  13. Governing Law and Dispute Resolution
                </h2>
                <p>
                  These Terms are governed by the laws of the Republic of
                  Singapore. Any disputes shall be resolved exclusively in the
                  courts of Singapore. For EU users, mandatory consumer
                  protections under Estonian law may apply.
                </p>
              </section>

              <section id="changes">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  14. Changes to Terms
                </h2>
                <p>
                  NeuFin may update these Terms from time to time. Continued use
                  of the Services after changes constitutes acceptance of the
                  revised Terms. We will notify material changes via email or
                  website notice.
                </p>
              </section>

              <section id="misc">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  15. Miscellaneous
                </h2>
                <ul className="ml-6 mt-3 list-disc space-y-2">
                  <li>
                    These Terms constitute the entire agreement between you and
                    NeuFin.
                  </li>
                  <li>
                    If any provision is held invalid, the remainder remains in
                    effect.
                  </li>
                  <li>
                    No waiver of any breach shall constitute a waiver of any
                    other breach.
                  </li>
                </ul>
              </section>

              <section id="contact">
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  Contact
                </h2>
                <p>
                  For questions about these Terms, contact:{" "}
                  <a
                    href="mailto:legal@neufin.ai"
                    className="text-primary underline hover:text-primary/80"
                  >
                    legal@neufin.ai
                  </a>{" "}
                  or NeuFin OÜ, Estonia.
                </p>
              </section>
            </div>

            {/* ── Page footer ── */}
            <div className="mt-14 border-t border-border/40 pt-6 text-sm text-muted-foreground/60">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p>
                  © 2026 Neufin OÜ. All rights reserved. A unit of CTech
                  Ventures.
                </p>
                <nav className="flex gap-4">
                  <Link href="/" className="hover:text-muted-foreground">
                    Home
                  </Link>
                  <Link href="/privacy" className="hover:text-muted-foreground">
                    Privacy Policy
                  </Link>
                  <a
                    href="mailto:legal@neufin.ai"
                    className="hover:text-muted-foreground"
                  >
                    legal@neufin.ai
                  </a>
                </nav>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
