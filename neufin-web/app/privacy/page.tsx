export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Privacy Policy | Neufin",
  description: "How Neufin collects, uses, and protects your data.",
};

const EFFECTIVE_DATE = "March 15, 2026";
const CONTACT_EMAIL = "privacy@neufin.app";
const APP_NAME = "Neufin";
const COMPANY = "Neufin Inc.";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-shell-deep flex flex-col">
      <nav className="border-b border-shell-border/60 bg-shell-deep/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">
            Neufin
          </Link>
          <Link
            href="/"
            className="text-shell-muted hover:text-white text-sm transition-colors"
          >
            ← Home
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-section w-full">
        <div className="prose prose-invert prose-sm max-w-none">
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-shell-subtle text-sm mb-10">
            Effective date: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}
          </p>

          <Section title="1. Overview">
            <p>
              {COMPANY} (&ldquo;Neufin&rdquo;, &ldquo;we&rdquo;,
              &ldquo;us&rdquo;) operates the {APP_NAME}
              web application and mobile app (collectively, the
              &ldquo;Service&rdquo;). This Privacy Policy explains what personal
              data we collect, why we collect it, how we use it, and the choices
              you have.
            </p>
            <p>
              By using Neufin you agree to this policy. If you do not agree,
              please stop using the Service.
            </p>
          </Section>

          <Section title="2. Data We Collect">
            <h3 className="text-white font-semibold mt-4 mb-2">
              2.1 Portfolio CSV files
            </h3>
            <p>
              When you upload a CSV file, we read the <code>symbol</code> and{" "}
              <code>shares</code> columns to compute your Investor DNA Score.
              This file is processed in memory and is{" "}
              <strong>never stored on our servers in its raw form</strong>. We
              store only the aggregated result (score, investor type,
              recommendations) linked to a random share token.
            </p>

            <h3 className="text-white font-semibold mt-4 mb-2">
              2.2 Account data (optional)
            </h3>
            <p>
              If you create an account, we collect your{" "}
              <strong>email address</strong> via Supabase Auth. You may also
              optionally provide your name and firm name if you use the advisor
              features. Account creation is not required to use the core DNA
              analysis.
            </p>

            <h3 className="text-white font-semibold mt-4 mb-2">
              2.3 Analysis history
            </h3>
            <p>
              For authenticated users, we store your DNA score history in our
              Supabase database so you can access it across devices. Each record
              contains: DNA score, investor type, recommendation, portfolio
              total value, and a share token. Individual position data (symbols
              and share counts) is <strong>not retained</strong> after analysis.
            </p>

            <h3 className="text-white font-semibold mt-4 mb-2">
              2.4 Usage analytics
            </h3>
            <p>
              We collect anonymised, first-party usage events (e.g.
              &ldquo;upload started&rdquo;, &ldquo;checkout clicked&rdquo;) to
              understand how the product is used and improve it. These events do
              not contain personal information or portfolio data. We do not use
              Google Analytics or Meta Pixel.
            </p>

            <h3 className="text-white font-semibold mt-4 mb-2">
              2.5 Payment information
            </h3>
            <p>
              Payments are processed entirely by <strong>Stripe</strong>. Neufin
              never sees or stores your full card number, CVV, or bank details.
              Stripe may collect billing address and card metadata per their own{" "}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:text-primary"
              >
                Privacy Policy
              </a>
              .
            </p>

            <h3 className="text-white font-semibold mt-4 mb-2">
              2.6 Referral tokens
            </h3>
            <p>
              If you arrive via a referral link, we store the referral token in
              your browser&rsquo;s localStorage to apply a discount at checkout.
              This token is a random 8-character string tied to the
              referrer&rsquo;s share record, not their identity.
            </p>
          </Section>

          <Section title="3. How We Use Your Data">
            <ul className="space-y-2 text-shell-fg/90">
              <li>
                <strong className="text-white">Providing the Service</strong> —
                to compute your Investor DNA Score and generate advisor PDF
                reports.
              </li>
              <li>
                <strong className="text-white">AI Analysis</strong> — your
                anonymised portfolio metrics (total value, score, position
                weights) are sent to AI providers (Anthropic Claude, Google
                Gemini, OpenAI, Groq) to generate insights. Raw symbol lists are
                included in AI prompts but are not stored by us after the
                request.
              </li>
              <li>
                <strong className="text-white">Market price data</strong> — we
                query Finnhub and Alpha Vantage with your stock symbols to fetch
                current prices. These queries are server-side; your symbols are
                not exposed to other users.
              </li>
              <li>
                <strong className="text-white">Email communications</strong> —
                if you subscribe to the weekly digest, we send you a periodic
                email with your latest DNA score context. You can unsubscribe at
                any time.
              </li>
              <li>
                <strong className="text-white">
                  Security and fraud prevention
                </strong>{" "}
                — to detect and prevent abuse of the platform.
              </li>
            </ul>
          </Section>

          <Section title="4. Third-Party Services">
            <p>We share data with the following sub-processors:</p>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-shell-border">
                    <th className="text-left py-2 pr-6 text-shell-muted font-medium">
                      Service
                    </th>
                    <th className="text-left py-2 pr-6 text-shell-muted font-medium">
                      Purpose
                    </th>
                    <th className="text-left py-2 text-shell-muted font-medium">
                      Data shared
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-shell-border/60">
                  {[
                    [
                      "Supabase",
                      "Database & authentication",
                      "Email, DNA score records",
                    ],
                    [
                      "Anthropic Claude",
                      "AI portfolio analysis",
                      "Portfolio metrics, symbols",
                    ],
                    [
                      "Google Gemini",
                      "AI fallback analysis",
                      "Portfolio metrics, symbols",
                    ],
                    [
                      "OpenAI",
                      "AI fallback analysis",
                      "Portfolio metrics, symbols",
                    ],
                    [
                      "Groq",
                      "AI fallback analysis",
                      "Portfolio metrics, symbols",
                    ],
                    ["Stripe", "Payment processing", "Email, billing metadata"],
                    ["Finnhub", "Live stock prices", "Stock ticker symbols"],
                    [
                      "Alpha Vantage",
                      "Live stock prices (fallback)",
                      "Stock ticker symbols",
                    ],
                    ["Railway", "Backend hosting", "Server logs (no PII)"],
                    ["Vercel", "Web hosting", "Server logs (no PII)"],
                  ].map(([svc, purpose, data]) => (
                    <tr key={svc}>
                      <td className="py-2.5 pr-6 text-white font-medium">
                        {svc}
                      </td>
                      <td className="py-2.5 pr-6 text-shell-muted">
                        {purpose}
                      </td>
                      <td className="py-2.5 text-shell-muted">{data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-shell-subtle text-xs">
              All AI providers are bound by data processing agreements and do
              not use your data to train their models under their API terms.
            </p>
          </Section>

          <Section title="5. Data Retention">
            <ul className="space-y-2 text-shell-fg/90">
              <li>
                <strong className="text-white">Anonymous analyses</strong> (no
                account) are retained for <strong>90 days</strong>, then
                automatically deleted.
              </li>
              <li>
                <strong className="text-white">Account DNA history</strong> is
                retained as long as your account is active.
              </li>
              <li>
                <strong className="text-white">PDF reports</strong> stored in
                Supabase Storage are accessible for <strong>1 year</strong> via
                signed URL, then archived.
              </li>
              <li>
                <strong className="text-white">Analytics events</strong> are
                retained for <strong>12 months</strong> in aggregated form.
              </li>
              <li>
                <strong className="text-white">Email subscriptions</strong> are
                retained until you unsubscribe or request deletion.
              </li>
            </ul>
          </Section>

          <Section title="6. Your Rights & Data Deletion">
            <p>
              You have the right to access, correct, export, or delete your
              personal data at any time.
            </p>
            <ul className="space-y-2 text-shell-fg/90 mt-3">
              <li>
                <strong className="text-white">Delete your Vault data</strong> —
                sign in, go to{" "}
                <Link href="/vault" className="text-primary hover:text-primary">
                  /vault
                </Link>
                , and use the account settings to delete your history. This
                removes all DNA score records associated with your account from
                our database.
              </li>
              <li>
                <strong className="text-white">Delete your account</strong> —
                email{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary hover:text-primary"
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                with the subject &ldquo;Delete my account&rdquo;. We will
                process your request within 30 days.
              </li>
              <li>
                <strong className="text-white">Export your data</strong> — email{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary hover:text-primary"
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                to request a JSON export of all data we hold about you.
              </li>
              <li>
                <strong className="text-white">Unsubscribe from emails</strong>{" "}
                — click the unsubscribe link in any email, or email us.
              </li>
            </ul>
          </Section>

          <Section title="7. Cookies & Local Storage">
            <p>
              Neufin does <strong>not</strong> use advertising cookies or
              cross-site tracking. We use browser <code>localStorage</code> for:
            </p>
            <ul className="space-y-1 text-shell-fg/90 mt-2">
              <li>
                <code>dnaResult</code> — your most recent DNA analysis result
                (cleared when you start over)
              </li>
              <li>
                <code>ref_token</code> — referral token from a ?ref= URL
                parameter
              </li>
              <li>
                <code>pendingReportId</code> — tracks a paid report waiting for
                PDF generation
              </li>
              <li>
                <code>neufin-auth</code> — Supabase session token (for
                authenticated users)
              </li>
              <li>
                <code>neufin_session_id</code> — anonymous session ID for
                analytics (tab-scoped)
              </li>
            </ul>
            <p className="mt-3">
              None of this data is shared with third parties. You can clear it
              at any time via your browser&rsquo;s developer tools.
            </p>
          </Section>

          <Section title="8. Children's Privacy">
            <p>
              Neufin is not directed at children under 13. We do not knowingly
              collect personal information from anyone under 13. If you believe
              a child has provided us data, contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary hover:text-primary"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              and we will delete it promptly.
            </p>
          </Section>

          <Section title="9. Security">
            <p>
              All data in transit is encrypted via TLS 1.2+. Data at rest in
              Supabase is encrypted using AES-256. We use Row Level Security
              (RLS) policies to ensure users can only access their own records.
              PDF reports are stored in a private Supabase Storage bucket and
              accessed only via time-limited signed URLs.
            </p>
            <p>
              No security system is perfect. If you discover a vulnerability,
              please disclose it responsibly to{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary hover:text-primary"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We may update this policy as the product evolves. Material changes
              will be announced by updating the &ldquo;Effective date&rdquo; at
              the top and, for registered users, by email. Continued use of the
              Service after changes constitutes acceptance.
            </p>
          </Section>

          <Section title="11. Contact Us">
            <p>For any privacy questions, data requests, or concerns:</p>
            <div className="card mt-3 space-y-1 text-sm">
              <p className="text-white font-semibold">{COMPANY}</p>
              <p className="text-shell-muted">
                Email:{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary hover:text-primary"
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p className="text-shell-muted">
                Response time: within 5 business days
              </p>
            </div>
          </Section>
        </div>
      </main>

      <footer className="border-t border-shell-border/60 py-6">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between text-xs text-shell-subtle">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="NeuFin"
              width={90}
              height={26}
              className="h-6 w-auto opacity-80"
            />
            <span>
              © {new Date().getFullYear()} {COMPANY}
            </span>
          </div>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-shell-muted transition-colors">
              Home
            </Link>
            <Link
              href="/upload"
              className="hover:text-shell-muted transition-colors"
            >
              Analyse Portfolio
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-white mb-4 pb-2 border-b border-shell-border/60">
        {title}
      </h2>
      <div className="space-y-3 text-shell-muted text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}
