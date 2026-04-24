import Link from "next/link";
import type { Metadata } from "next";
import { Shield, Lock, Server, Globe, FileCheck, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Security | NeuFin",
  description:
    "NeuFin security posture: encryption, data residency, sub-processors, and compliance commitments.",
};

const SECTIONS = [
  {
    Icon: Lock,
    title: "Encryption",
    items: [
      "TLS 1.3 in transit — all API and web traffic",
      "AES-256 at rest — all database records and file storage",
      "JWT-signed sessions with short expiry and automatic rotation",
      "API keys hashed (bcrypt) — NeuFin cannot read your key value",
    ],
  },
  {
    Icon: Server,
    title: "Data Residency",
    items: [
      "Primary database: Supabase (EU region — Frankfurt, Germany)",
      "Backend compute: Railway (EU/US region-selectable)",
      "AI inference: Anthropic API (US) · OpenAI API (US)",
      "No personal data transferred outside EU/US without DPA coverage",
    ],
  },
  {
    Icon: Globe,
    title: "Sub-processors",
    items: [
      "Anthropic — AI inference (Claude models)",
      "OpenAI — AI inference (GPT-4o fallback)",
      "Supabase — database and authentication",
      "Railway — backend compute and hosting",
      "Vercel — frontend hosting and edge CDN",
      "Stripe — payment processing (PCI DSS Level 1)",
    ],
  },
  {
    Icon: FileCheck,
    title: "Compliance",
    items: [
      "GDPR Article 28 — Data Processing Agreement available on request",
      "SOC 2 Type II — audit in progress (target: Q3 2026)",
      "Penetration test — scheduled annually; last test: internal review Q1 2026",
      "MAS TRM guidelines aligned — Singapore fintech readiness",
      "No data sold to third parties · No training on customer portfolio data",
    ],
  },
  {
    Icon: Shield,
    title: "Application Security",
    items: [
      "OWASP Top 10 mitigations applied",
      "CSP, HSTS, X-Frame-Options, and Referrer-Policy headers on all responses",
      "Parameterized queries — no SQL injection surface",
      "Rate limiting on all public endpoints",
      "Admin endpoints protected by separate auth layer",
    ],
  },
  {
    Icon: Users,
    title: "Access Controls",
    items: [
      "Row-level security (RLS) in Supabase — users cannot access other users' data",
      "Admin access requires explicit role grant + separate session validation",
      "No shared credentials — every integration uses scoped service accounts",
      "Audit log of admin actions (user plan changes, access grants)",
    ],
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-app text-navy">
      <nav className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-navy">
            NeuFin
          </Link>
          <span className="text-sm text-muted2">Security</span>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl space-y-12 px-6 py-12">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-extrabold tracking-tight">
              Security at NeuFin
            </h1>
          </div>
          <p className="max-w-2xl text-lg text-slate2">
            NeuFin is built for institutional-grade use. We apply bank-level
            security controls, maintain a GDPR-compliant data architecture, and
            are actively working toward SOC 2 Type II certification.
          </p>
          <a
            href="mailto:security@neufin.ai"
            className="inline-block rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-slate2 hover:border-primary hover:text-primary"
          >
            Report a vulnerability → security@neufin.ai
          </a>
        </div>

        {/* Sections */}
        <div className="grid gap-6 md:grid-cols-2">
          {SECTIONS.map(({ Icon, title, items }) => (
            <div
              key={title}
              className="space-y-3 rounded-2xl border border-border bg-white p-6 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <h2 className="font-bold text-navy">{title}</h2>
              </div>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate2">
                    <span className="mt-0.5 text-emerald-500 shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* DPA CTA */}
        <div className="rounded-2xl border border-primary/20 bg-primary-light/40 p-8 space-y-4">
          <h2 className="text-xl font-bold text-navy">
            Data Processing Agreement (DPA)
          </h2>
          <p className="text-slate2">
            If your organization requires a signed DPA under GDPR Article 28,
            we provide a standard DPA covering all NeuFin sub-processors and
            data flows. Enterprise customers receive a countersigned copy within
            2 business days.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/legal/dpa"
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              View DPA →
            </Link>
            <a
              href="mailto:legal@neufin.ai?subject=DPA Request"
              className="rounded-xl border border-border px-6 py-2.5 text-sm font-medium text-slate2 hover:border-primary hover:text-primary"
            >
              Request countersigned DPA
            </a>
          </div>
        </div>

        {/* Disclosure timeline */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Responsible Disclosure</h2>
          <p className="text-sm text-slate2">
            We follow a 90-day coordinated disclosure policy. To report a
            security vulnerability, email{" "}
            <a
              href="mailto:security@neufin.ai"
              className="font-medium text-primary hover:underline"
            >
              security@neufin.ai
            </a>{" "}
            with a description, steps to reproduce, and your contact details. We
            will acknowledge within 24 hours and provide a remediation timeline.
          </p>
        </section>
      </div>
    </div>
  );
}
