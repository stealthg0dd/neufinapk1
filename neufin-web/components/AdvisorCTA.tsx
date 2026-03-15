'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAdvisorProfile, type AdvisorProfile } from '@/lib/api'

interface Props {
  /** ref_token from ?ref= URL param — used to look up the advisor who shared this link */
  refToken: string
}

/**
 * Shown on results/share pages when a visitor arrived via an advisor's referral link.
 * Fetches the advisor's public profile and renders a "Book a Consultation" card.
 * Renders nothing if no advisor is found or the fetch fails.
 */
export default function AdvisorCTA({ refToken }: Props) {
  const [profile,  setProfile]  = useState<AdvisorProfile | null>(null)
  const [visible,  setVisible]  = useState(false)

  useEffect(() => {
    if (!refToken) return

    // The ref_token is a share_token (8-char hex) — we need to find the advisor_id.
    // For now, we try to load a user_profile where a dna_scores.share_token matches.
    // The backend GET /api/advisors/{advisor_id} expects a user UUID, so we first
    // validate the ref_token to get context, then show the CTA if the referrer
    // has an advisor profile set up.
    //
    // Strategy: validate via /api/referrals/validate/{ref_token}, then
    // attempt GET /api/advisors/{ref_token} as a best-effort lookup
    // (backend can handle missing gracefully with 404).
    const API = process.env.NEXT_PUBLIC_API_URL || 'https://neufin101-production.up.railway.app'
    fetch(`${API}/api/advisors/by-token/${refToken}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((advisorData: AdvisorProfile) => {
        if (advisorData.advisor_name) {
          setProfile(advisorData)
          setTimeout(() => setVisible(true), 800)
        }
      })
      .catch(() => {})
  }, [refToken])

  return (
    <AnimatePresence>
      {visible && profile && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="rounded-2xl border p-5 space-y-4"
          style={{
            borderColor: `${profile.brand_color || '#1A56DB'}40`,
            background:  `${profile.brand_color || '#1A56DB'}08`,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            {profile.logo_base64 ? (
              <img
                src={profile.logo_base64}
                alt={`${profile.firm_name} logo`}
                className="w-10 h-10 object-contain rounded-lg bg-white/10 p-0.5 shrink-0"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-base shrink-0"
                style={{ backgroundColor: profile.brand_color || '#1A56DB' }}
              >
                {(profile.firm_name || profile.advisor_name).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{profile.advisor_name}</p>
              <p className="text-gray-400 text-xs truncate">{profile.firm_name}</p>
            </div>
          </div>

          {/* Value prop */}
          <p className="text-gray-400 text-sm leading-relaxed">
            You were referred by <span className="text-white font-medium">{profile.advisor_name}</span>.
            Want a professional advisor to walk you through your results and build a personalised investment plan?
          </p>

          {/* CTA */}
          {profile.calendar_link ? (
            <a
              href={profile.calendar_link}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: profile.brand_color || '#1A56DB' }}
            >
              📅 Book a Free Consultation
            </a>
          ) : (
            <div
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white text-sm font-semibold opacity-60 cursor-default"
              style={{ backgroundColor: profile.brand_color || '#1A56DB' }}
            >
              📅 Book a Free Consultation
            </div>
          )}

          <p className="text-xs text-center text-gray-600">
            No obligation · {profile.firm_name || 'Independent Advisor'}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
