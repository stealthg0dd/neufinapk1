"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

const API = process.env.NEXT_PUBLIC_API_URL;

const AUM_RANGES = [
  "Under $1M",
  "$1M – $10M",
  "$10M – $50M",
  "$50M – $200M",
  "Over $200M",
];

const ROLES = [
  "Financial Advisor / Wealth Manager",
  "Fund Manager",
  "Family Office",
  "Chief Investment Officer",
  "Fintech Product Manager",
  "Institutional Investor",
  "Other",
];

export default function ContactSalesPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    aum_range: "",
    message: "",
  });
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch(`${API}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Submit failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-shell-deep flex flex-col">
      <nav className="border-b border-shell-border/60 backdrop-blur-sm sticky top-0 z-10 bg-shell-deep/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <BrandLogo variant="marketing-footer-dark" href="/" />
          <Link
            href="/pricing"
            className="text-shell-muted hover:text-white text-sm transition-colors"
          >
            ← See Pricing
          </Link>
        </div>
      </nav>

      <main className="flex-1 px-6 py-section">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <span className="badge border border-purple-400/35 bg-purple-500/15 text-purple-200 mb-4 inline-block">
              Enterprise Sales
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold mb-4">
              Let&apos;s build something{" "}
              <span className="text-gradient">together</span>
            </h1>
            <p className="text-shell-muted leading-relaxed">
              Tell us about your firm and we&apos;ll tailor a solution for you.
              We typically respond within 24 hours.
            </p>
          </div>

          {status === "success" ? (
            <div className="glass-card space-y-4 p-10 text-center">
              <div className="text-5xl">✅</div>
              <h2 className="text-2xl font-bold text-slate-900">
                Message received!
              </h2>
              <p className="text-slate-600">
                We&apos;ll be in touch within{" "}
                <strong className="text-slate-900">24 hours</strong>. Our team
                is based in Singapore and covers all of Southeast Asia.
              </p>
              <Link href="/pricing" className="btn-primary inline-block mt-2">
                See Pricing →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="glass-card space-y-5 p-8">
              {/* Name + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Jane Tan"
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1EB8CC] focus:outline-none focus:ring-1 focus:ring-[#1EB8CC]/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Work Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="jane@firm.com.sg"
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1EB8CC] focus:outline-none focus:ring-1 focus:ring-[#1EB8CC]/30"
                  />
                </div>
              </div>

              {/* Company */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Company / Firm *
                </label>
                <input
                  type="text"
                  name="company"
                  required
                  value={form.company}
                  onChange={handleChange}
                  placeholder="ABC Wealth Management Pte Ltd"
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1EB8CC] focus:outline-none focus:ring-1 focus:ring-[#1EB8CC]/30"
                />
              </div>

              {/* Role */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Your Role *
                </label>
                <select
                  name="role"
                  required
                  value={form.role}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-[#1EB8CC] focus:outline-none focus:ring-1 focus:ring-[#1EB8CC]/30"
                >
                  <option value="" disabled>
                    Select your role
                  </option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* AUM range */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Assets Under Management (AUM)
                </label>
                <select
                  name="aum_range"
                  value={form.aum_range}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-[#1EB8CC] focus:outline-none focus:ring-1 focus:ring-[#1EB8CC]/30"
                >
                  <option value="">Prefer not to say</option>
                  {AUM_RANGES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  What are you looking to achieve?
                </label>
                <textarea
                  name="message"
                  rows={4}
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell us about your firm, your clients, and what you'd like NeuFin to do for you…"
                  className="w-full resize-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1EB8CC] focus:outline-none focus:ring-1 focus:ring-[#1EB8CC]/30"
                />
              </div>

              {status === "error" && (
                <p className="text-center text-sm text-red-600">
                  Something went wrong. Please try again or email us at
                  hello@neufin.com
                </p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {status === "loading" ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send Message →"
                )}
              </button>

              <p className="text-center text-xs text-shell-muted">
                We&apos;ll contact you within 24 hours · No spam, ever
              </p>
            </form>
          )}
        </div>
      </main>

      <footer className="border-t border-shell-border/60 py-6 text-center text-sm text-shell-muted">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo variant="marketing-footer-dark" href="/" />
          </div>
          <span>
            NeuFin © {new Date().getFullYear()} · Singapore · MAS-compliant
          </span>
        </div>
      </footer>
    </div>
  );
}
