"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { debugAuth } from "@/lib/auth-debug";
import {
  getAdvisorReports,
  generateWhiteLabelReport,
  type AdvisorProfile,
} from "@/lib/api";

interface Report {
  id: string;
  portfolio_id: string;
  pdf_url: string | null;
  is_paid: boolean;
  created_at: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function AdvisorDashboardPage() {
  const { user, token, loading } = useAuth();

  const [reports, setReports] = useState<Report[]>([]);
  const [profile, setProfile] = useState<Omit<
    AdvisorProfile,
    "id" | "subscription_tier"
  > | null>(null);
  const [fetching, setFetching] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null); // portfolio_id being generated
  const [genError, setGenError] = useState<string | null>(null);
  const [shareCount, setShareCount] = useState(0);
  const [referralUrl, setReferralUrl] = useState("");

  useEffect(() => {
    debugAuth("advisor/dashboard:mount");
  }, []);

  // Load profile + reports + share stats from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("advisorProfile");
      if (cached) {
        try {
          setProfile(JSON.parse(cached));
        } catch {}
      }
      const count = parseInt(
        localStorage.getItem("neufin_share_count") || "0",
        10,
      );
      setShareCount(count);

      const dnaRaw = localStorage.getItem("dnaResult");
      if (dnaRaw) {
        try {
          const dna = JSON.parse(dnaRaw);
          if (dna.share_token) {
            setReferralUrl(`${window.location.origin}/?ref=${dna.share_token}`);
          }
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    if (!user || !token) {
      setFetching(false);
      return;
    }
    getAdvisorReports(user.id, token)
      .then((data) => setReports(data.reports || []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user, token]);

  async function handleGeneratePDF(portfolioId: string) {
    if (!user || !token || !profile) return;
    setGenerating(portfolioId);
    setGenError(null);
    try {
      const result = await generateWhiteLabelReport({
        portfolio_id: portfolioId,
        advisor_id: user.id,
        advisor_name: profile.advisor_name,
        logo_base64: profile.logo_base64,
        color_scheme: profile.white_label
          ? {
              primary: profile.brand_color,
              secondary: "#8B5CF6",
              accent: "#F97316",
            }
          : null,
      });
      if (result.pdf_url) {
        setReports((prev) =>
          prev.map((r) =>
            r.portfolio_id === portfolioId
              ? { ...r, pdf_url: result.pdf_url }
              : r,
          ),
        );
      }
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(null);
    }
  }

  if (loading || fetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app px-6 text-center text-navy">
        <p className="text-2xl font-bold">Sign in required</p>
        <Link
          href="/auth?next=/advisor/dashboard"
          className="btn-primary px-6 py-2"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const paidReports = reports.filter((r) => r.is_paid);
  const pendingReports = reports.filter((r) => !r.is_paid);

  return (
    <div className="flex min-h-screen flex-col bg-app text-navy">
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="text-xl font-bold text-gradient">
            Neufin
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/advisor/settings"
              className="text-sm text-muted2 transition-colors hover:text-primary-dark"
            >
              ⚙ Settings
            </Link>
            <Link
              href="/results"
              className="text-sm text-muted2 transition-colors hover:text-primary-dark"
            >
              DNA Results
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-section md:px-0">
        {/* Header */}
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div>
            <h1>
              {profile?.firm_name
                ? `${profile.firm_name} Dashboard`
                : "Advisor Dashboard"}
            </h1>
            <p>Manage client reports and track your referral performance.</p>
          </div>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {[
            { label: "Total Reports", value: reports.length, icon: "📄" },
            { label: "Paid Reports", value: paidReports.length, icon: "✅" },
            { label: "Shares Sent", value: shareCount, icon: "📤" },
            { label: "Referral Links", value: referralUrl ? 1 : 0, icon: "🔗" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="card text-center ring-1 ring-inset ring-primary/30"
            >
              <div className="mb-1 text-2xl">{stat.icon}</div>
              <div className="text-2xl font-bold text-navy">{stat.value}</div>
              <div className="mt-0.5 text-xs text-muted2">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Referral link */}
        {referralUrl && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="card space-y-3 ring-1 ring-inset ring-primary/30"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-navy">Your Referral Link</h2>
              <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                20% off for clients
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={referralUrl}
                className="input flex-1 text-xs font-mono"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(referralUrl)}
                className="btn-outline text-sm px-3 py-2 shrink-0"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-muted2">
              Share this link with potential clients. When they upload their
              portfolio through your link, they receive 20% off their first
              report — and you get credit for the referral.
            </p>
          </motion.div>
        )}

        {/* Reports table */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="card ring-1 ring-inset ring-primary/30"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-navy">Client Reports</h2>
            {!profile && (
              <Link
                href="/advisor/settings"
                className="text-xs text-primary hover:text-primary transition-colors"
              >
                Set up branding first →
              </Link>
            )}
          </div>

          {genError && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {genError}
            </p>
          )}

          {reports.length === 0 ? (
            <div className="space-y-3 py-section text-center">
              <p className="text-4xl">📊</p>
              <p className="font-medium text-muted2">No reports yet</p>
              <p className="text-sm text-muted2">
                Share your referral link with clients. When they pay for a
                report through your link, it will appear here.
              </p>
              <Link
                href="/advisor/settings"
                className="btn-primary inline-block mt-2 px-4 py-2 text-sm"
              >
                Set Up Your Profile
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted2">
                    <th className="py-2 pr-4 text-left font-medium">Date</th>
                    <th className="py-2 pr-4 text-left font-medium">
                      Portfolio ID
                    </th>
                    <th className="py-2 pr-4 text-left font-medium">Status</th>
                    <th className="py-2 text-left font-medium">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reports.map((report) => (
                    <tr
                      key={report.id}
                      className="transition-colors hover:bg-surface-2"
                    >
                      <td className="whitespace-nowrap py-3 pr-4 text-muted2">
                        {fmt(report.created_at)}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-navy">
                        {report.portfolio_id.slice(0, 12)}…
                      </td>
                      <td className="py-3 pr-4">
                        {report.is_paid ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                            Paid
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        {report.pdf_url ? (
                          <a
                            href={report.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary transition-colors hover:text-primary-dark"
                          >
                            Download ↗
                          </a>
                        ) : report.is_paid && profile ? (
                          <button
                            type="button"
                            disabled={generating === report.portfolio_id}
                            onClick={() =>
                              handleGeneratePDF(report.portfolio_id)
                            }
                            className="flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary-dark disabled:opacity-50"
                          >
                            {generating === report.portfolio_id ? (
                              <>
                                <span className="h-3 w-3 animate-spin rounded-full border border-primary/40 border-t-primary" />
                                Generating…
                              </>
                            ) : (
                              "Generate PDF"
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-muted2">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Upgrade CTA for free tier */}
        {(!profile || !profile.white_label) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2 }}
            className="card border border-primary/30 bg-primary-light/50 ring-1 ring-inset ring-primary/20"
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0 text-3xl">🏷️</div>
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 font-semibold text-navy">
                  Unlock White-Label Reports
                </h3>
                <p className="mb-3 text-sm text-muted2">
                  Replace Neufin branding with your firm&apos;s logo and colors.
                  Impress clients with fully branded advisor PDFs.
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    href="/advisor/settings"
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    Enable White-Labeling
                  </Link>
                  <span className="text-xs text-muted2">
                    Requires Pro plan · $99/mo
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
