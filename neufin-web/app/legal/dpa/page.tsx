import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Processing Agreement | NeuFin",
  description:
    "NeuFin Data Processing Agreement (DPA) — GDPR Article 28 compliant. Request a countersigned copy for your enterprise contract.",
};

export default function DpaPage() {
  return (
    <div className="min-h-screen bg-app text-navy">
      <nav className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-navy">
            NeuFin
          </Link>
          <span className="text-sm text-muted2">Legal / DPA</span>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl space-y-10 px-6 py-12">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Data Processing Agreement
          </h1>
          <p className="text-muted2 text-sm">
            Effective: 1 January 2025 · Governed by: GDPR Article 28 · Entity:
            Neufin OÜ (Estonia)
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href="mailto:legal@neufin.ai?subject=DPA Countersignature Request"
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Request Countersigned DPA →
            </a>
            <Link
              href="/security"
              className="rounded-xl border border-border px-6 py-2.5 text-sm font-medium text-slate2 hover:border-primary hover:text-primary"
            >
              Security posture
            </Link>
          </div>
        </div>

        <div className="prose prose-sm max-w-none space-y-8 text-slate2">
          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-navy">
              1. Parties and Scope
            </h2>
            <p>
              This Data Processing Agreement (&ldquo;DPA&rdquo;) is entered
              into between <strong>Neufin OÜ</strong>, registered in Estonia
              (EU) (&ldquo;Processor&rdquo;), and the enterprise customer
              identified in the Order Form or API agreement
              (&ldquo;Controller&rdquo;).
            </p>
            <p>
              This DPA forms part of, and is governed by, the NeuFin Terms of
              Service and applies to all Personal Data processed by Neufin OÜ on
              behalf of the Controller through the NeuFin platform, APIs, and
              related services.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-navy">
              2. Nature of Processing
            </h2>
            <p>
              The Processor processes Personal Data solely to provide the NeuFin
              portfolio intelligence services contracted by the Controller. This
              includes:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Portfolio analysis and behavioral DNA scoring</li>
              <li>Swarm IC multi-agent analysis</li>
              <li>PDF report generation</li>
              <li>API authentication and rate-limiting</li>
              <li>Session management and audit logging</li>
            </ul>
            <p>
              The Processor does not use Controller&apos;s Personal Data to
              train AI models or for any purpose beyond service delivery.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-navy">
              3. Types of Personal Data
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Email addresses and name (authentication)</li>
              <li>Portfolio holdings (positions, weights, values)</li>
              <li>IP addresses and session identifiers</li>
              <li>Usage logs and API call records</li>
            </ul>
            <p>
              No special category data (Article 9 GDPR) is collected or
              processed.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-navy">
              4. Processor Obligations
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Process Personal Data only on documented instructions from the
                Controller
              </li>
              <li>
                Ensure persons authorised to process are bound by
                confidentiality
              </li>
              <li>
                Implement appropriate technical and organisational security
                measures (see Section 6)
              </li>
              <li>
                Assist the Controller with data subject rights requests within
                30 days
              </li>
              <li>
                Delete or return all Personal Data upon termination, at
                Controller&apos;s election
              </li>
              <li>
                Make available all information necessary to demonstrate
                compliance and allow for audits
              </li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-navy">5. Sub-processors</h2>
            <p>
              The Processor engages the following sub-processors. The Controller
              authorises these engagements:
            </p>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted2">
                    <th className="px-4 py-2">Sub-processor</th>
                    <th className="px-4 py-2">Purpose</th>
                    <th className="px-4 py-2">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Supabase Inc.", "Database & auth", "EU (Germany)"],
                    ["Railway Corp.", "Backend compute", "US / EU"],
                    ["Vercel Inc.", "Frontend hosting", "US / EU (edge)"],
                    ["Anthropic PBC", "AI inference", "United States"],
                    ["OpenAI LLC", "AI inference (fallback)", "United States"],
                    ["Stripe Inc.", "Payment processing", "United States"],
                  ].map(([name, purpose, location]) => (
                    <tr
                      key={name}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-2 font-medium text-navy">{name}</td>
                      <td className="px-4 py-2 text-slate2">{purpose}</td>
                      <td className="px-4 py-2 text-slate2">{location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              The Processor will notify the Controller at least 14 days before
              adding or replacing sub-processors.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-bold text-navy">
              6. Technical and Organisational Measures
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>TLS 1.3 encryption in transit on all connections</li>
              <li>AES-256 encryption at rest for all stored data</li>
              <li>Row-level security isolating each customer&apos;s data</li>
              <li>
                Role-based access controls with principle of least privilege
              </li>
              <li>Automated backups with 30-day retention</li>
              <li>Annual penetration testing</li>
              <li>SOC 2 Type II audit in progress (target: Q3 2026)</li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-bold text-navy">
              7. International Transfers
            </h2>
            <p>
              Where Personal Data is transferred to sub-processors outside the
              EU/EEA (Anthropic, OpenAI, Stripe, Vercel US edge), such transfers
              are governed by Standard Contractual Clauses (SCCs) as adopted by
              the European Commission.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-bold text-navy">8. Data Breach</h2>
            <p>
              The Processor will notify the Controller without undue delay, and
              no later than 72 hours after becoming aware, of any Personal Data
              breach. Notification will include the nature of the breach,
              categories and number of data subjects affected, likely
              consequences, and measures taken to address the breach.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-bold text-navy">9. Contact</h2>
            <p>
              Data Protection Officer:{" "}
              <a
                href="mailto:legal@neufin.ai"
                className="font-medium text-primary hover:underline"
              >
                legal@neufin.ai
              </a>
              <br />
              Neufin OÜ · Harju maakond, Tallinn, Kesklinna linnaosa, Vesivärva
              tn 50-201, 10152 · Estonia
            </p>
            <p>
              To request a countersigned copy of this DPA for your enterprise
              contract, email{" "}
              <a
                href="mailto:legal@neufin.ai?subject=DPA Countersignature Request"
                className="font-medium text-primary hover:underline"
              >
                legal@neufin.ai
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
