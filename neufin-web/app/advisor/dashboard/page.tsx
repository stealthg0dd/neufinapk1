'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth-context'
import { getAdvisorReports, generateWhiteLabelReport, type AdvisorProfile } from '@/lib/api'

interface Report {
  id: string
  portfolio_id: string
  pdf_url: string | null
  is_paid: boolean
  created_at: string
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function AdvisorDashboardPage() {
  const { user, token, loading } = useAuth()

  const [reports,       setReports]       = useState<Report[]>([])
  const [profile,       setProfile]       = useState<Omit<AdvisorProfile, 'id' | 'subscription_tier'> | null>(null)
  const [fetching,      setFetching]      = useState(true)
  const [generating,    setGenerating]    = useState<string | null>(null)   // portfolio_id being generated
  const [genError,      setGenError]      = useState<string | null>(null)
  const [shareCount,    setShareCount]    = useState(0)
  const [referralUrl,   setReferralUrl]   = useState('')

  // Load profile + reports + share stats from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('advisorProfile')
      if (cached) {
        try { setProfile(JSON.parse(cached)) } catch {}
      }
      const count = parseInt(localStorage.getItem('neufin_share_count') || '0', 10)
      setShareCount(count)

      const dnaRaw = localStorage.getItem('dnaResult')
      if (dnaRaw) {
        try {
          const dna = JSON.parse(dnaRaw)
          if (dna.share_token) {
            setReferralUrl(`${window.location.origin}/?ref=${dna.share_token}`)
          }
        } catch {}
      }
    }
  }, [])

  useEffect(() => {
    if (!user || !token) { setFetching(false); return }
    getAdvisorReports(user.id, token)
      .then(data => setReports(data.reports || []))
      .catch(() => {})
      .finally(() => setFetching(false))
  }, [user, token])

  async function handleGeneratePDF(portfolioId: string) {
    if (!user || !token || !profile) return
    setGenerating(portfolioId)
    setGenError(null)
    try {
      const result = await generateWhiteLabelReport(
        {
          portfolio_id:  portfolioId,
          advisor_id:    user.id,
          advisor_name:  profile.advisor_name,
          logo_base64:   profile.logo_base64,
          color_scheme:  profile.white_label
            ? { primary: profile.brand_color, secondary: '#8B5CF6', accent: '#F97316' }
            : null,
        },
        token
      )
      if (result.pdf_url) {
        setReports(prev =>
          prev.map(r =>
            r.portfolio_id === portfolioId ? { ...r, pdf_url: result.pdf_url } : r
          )
        )
      }
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(null)
    }
  }

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-2xl font-bold text-white">Sign in required</p>
        <Link href="/login" className="btn-primary px-6 py-2">Sign In</Link>
      </div>
    )
  }

  const paidReports    = reports.filter(r => r.is_paid)
  const pendingReports = reports.filter(r => !r.is_paid)

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
          <div className="flex items-center gap-4">
            <Link href="/advisor/settings" className="text-gray-400 hover:text-white text-sm transition-colors">
              ⚙ Settings
            </Link>
            <Link href="/results" className="text-gray-400 hover:text-white text-sm transition-colors">
              DNA Results
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-10 w-full space-y-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="text-2xl font-bold text-white mb-1">
            {profile?.firm_name ? `${profile.firm_name} Dashboard` : 'Advisor Dashboard'}
          </h1>
          <p className="text-gray-500 text-sm">Manage client reports and track your referral performance.</p>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {[
            { label: 'Total Reports',   value: reports.length,       icon: '📄' },
            { label: 'Paid Reports',    value: paidReports.length,   icon: '✅' },
            { label: 'Shares Sent',     value: shareCount,           icon: '📤' },
            { label: 'Referral Links',  value: referralUrl ? 1 : 0,  icon: '🔗' },
          ].map(stat => (
            <div key={stat.label} className="card text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Referral link */}
        {referralUrl && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="card space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Your Referral Link</h2>
              <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">20% off for clients</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={referralUrl}
                className="input flex-1 text-xs font-mono"
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(referralUrl)}
                className="btn-outline text-sm px-3 py-2 shrink-0"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Share this link with potential clients. When they upload their portfolio through your link, they receive 20% off their first report — and you get credit for the referral.
            </p>
          </motion.div>
        )}

        {/* Reports table */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Client Reports</h2>
            {!profile && (
              <Link href="/advisor/settings" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                Set up branding first →
              </Link>
            )}
          </div>

          {genError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4">
              {genError}
            </p>
          )}

          {reports.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-4xl">📊</p>
              <p className="text-gray-400 font-medium">No reports yet</p>
              <p className="text-gray-600 text-sm">
                Share your referral link with clients. When they pay for a report through your link, it will appear here.
              </p>
              <Link href="/advisor/settings" className="btn-primary inline-block mt-2 px-4 py-2 text-sm">
                Set Up Your Profile
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 pr-4 font-medium">Date</th>
                    <th className="text-left py-2 pr-4 font-medium">Portfolio ID</th>
                    <th className="text-left py-2 pr-4 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {reports.map(report => (
                    <tr key={report.id} className="hover:bg-gray-900/40 transition-colors">
                      <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">
                        {fmt(report.created_at)}
                      </td>
                      <td className="py-3 pr-4 font-mono text-gray-300 text-xs">
                        {report.portfolio_id.slice(0, 12)}…
                      </td>
                      <td className="py-3 pr-4">
                        {report.is_paid ? (
                          <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">
                            Paid
                          </span>
                        ) : (
                          <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full">
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
                            className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
                          >
                            Download ↗
                          </a>
                        ) : report.is_paid && profile ? (
                          <button
                            type="button"
                            disabled={generating === report.portfolio_id}
                            onClick={() => handleGeneratePDF(report.portfolio_id)}
                            className="text-xs text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {generating === report.portfolio_id ? (
                              <>
                                <span className="w-3 h-3 border border-purple-400/40 border-t-purple-400 rounded-full animate-spin" />
                                Generating…
                              </>
                            ) : (
                              'Generate PDF'
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
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
            className="card border-purple-500/20 bg-purple-500/5"
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl shrink-0">🏷️</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white mb-1">Unlock White-Label Reports</h3>
                <p className="text-gray-400 text-sm mb-3">
                  Replace Neufin branding with your firm's logo and colors. Impress clients with fully branded advisor PDFs.
                </p>
                <div className="flex items-center gap-3">
                  <Link href="/advisor/settings" className="btn-primary text-sm px-4 py-2">
                    Enable White-Labeling
                  </Link>
                  <span className="text-xs text-gray-500">Requires Pro plan · $99/mo</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

      </main>
    </div>
  )
}
