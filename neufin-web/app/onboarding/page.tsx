'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, apiGet } from '@/lib/api-client'

const ROLES = [
  { id: 'retail', label: 'Individual Investor', desc: 'Managing my own portfolio' },
  { id: 'advisor', label: 'Financial Advisor / IFA', desc: 'Managing portfolios for clients' },
  { id: 'pm', label: 'Portfolio Manager / PE', desc: 'Institutional portfolio management' },
  { id: 'enterprise', label: 'Platform / B2B', desc: 'Integrating NeuFin into my platform' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [role, setRole] = useState('')
  const [name, setName] = useState('')
  const [wantWhiteLabel, setWantWhiteLabel] = useState(false)
  const [firmName, setFirmName] = useState('')
  const [advisorName, setAdvisorName] = useState('')
  const [brandColor, setBrandColor] = useState('#1EB8CC')
  const [logoBase64, setLogoBase64] = useState('')
  const [loading, setLoading] = useState(false)

  const isAdvisorRole = ['advisor', 'pm', 'enterprise'].includes(role)

  useEffect(() => {
    apiGet<{ onboarding_completed?: boolean }>('/api/subscription/status')
      .then((d) => {
        if (d?.onboarding_completed === true) router.replace('/dashboard')
      })
      .catch(() => {})
  }, [router])

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const res = ev.target?.result
      if (typeof res !== 'string') return
      const parts = res.split(',')
      setLogoBase64(parts.length > 1 ? parts[1]! : parts[0]!)
    }
    reader.readAsDataURL(file)
  }

  async function handleComplete() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/profile/complete-onboarding', {
        method: 'POST',
        body: JSON.stringify({
          user_type: role || undefined,
          advisor_name: (isAdvisorRole ? advisorName.trim() : name.trim()) || name.trim(),
          firm_name: isAdvisorRole && wantWhiteLabel ? firmName.trim() : undefined,
          white_label: Boolean(isAdvisorRole && wantWhiteLabel),
          brand_color: brandColor,
          logo_base64: logoBase64 || undefined,
        }),
      })
      if (!res.ok) {
        console.error('[onboarding] HTTP', res.status, await res.text().catch(() => ''))
      }
      router.push('/dashboard')
    } catch (e) {
      console.error('[onboarding] Failed:', e)
      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0B0F14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: '#161D2E',
          borderRadius: 16,
          border: '1px solid #2A3550',
          padding: 40,
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: s <= step ? '#1EB8CC' : '#2A3550',
              }}
            />
          ))}
        </div>

        {step === 1 && (
          <div>
            <h2 style={{ color: '#F0F4FF', fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>
              Welcome to NeuFin
            </h2>
            <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 24px' }}>
              Tell us about yourself so we can personalise your experience.
            </p>

            <label style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginBottom: 6 }}>
              YOUR NAME
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0B0F14',
                border: '1px solid #2A3550',
                borderRadius: 8,
                color: '#F0F4FF',
                fontSize: 13,
                marginBottom: 20,
                boxSizing: 'border-box',
              }}
            />

            <label style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginBottom: 10 }}>
              YOUR ROLE
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ROLES.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setRole(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setRole(r.id)
                  }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    border: role === r.id ? '2px solid #1EB8CC' : '1px solid #2A3550',
                    background: role === r.id ? '#0D1F2A' : '#0B0F14',
                  }}
                >
                  <div style={{ color: '#F0F4FF', fontSize: 13, fontWeight: 500 }}>{r.label}</div>
                  <div style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>{r.desc}</div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!role || !name.trim()}
              style={{
                width: '100%',
                marginTop: 24,
                padding: '12px',
                background: !role || !name.trim() ? '#2A3550' : '#1EB8CC',
                color: !role || !name.trim() ? '#64748B' : '#0B0F14',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: !role || !name.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ color: '#F0F4FF', fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>
              {isAdvisorRole ? 'Your Firm' : 'Almost done'}
            </h2>

            {isAdvisorRole ? (
              <>
                <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 24px' }}>
                  White-label NeuFin reports with your firm branding. Your clients see your name, not ours.
                </p>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setWantWhiteLabel(!wantWhiteLabel)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setWantWhiteLabel(!wantWhiteLabel)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    background: '#0D1F2A',
                    border: '1px solid #1EB8CC40',
                    borderRadius: 8,
                    marginBottom: 20,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={wantWhiteLabel}
                    onChange={(e) => setWantWhiteLabel(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ color: '#F0F4FF', fontSize: 13, fontWeight: 500 }}>
                      Enable white-label branding on reports
                    </div>
                    <div style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>
                      Your logo and firm name on every IC report PDF
                    </div>
                  </div>
                </div>

                {wantWhiteLabel && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: 11, display: 'block', marginBottom: 4 }}>
                        FIRM NAME
                      </label>
                      <input
                        value={firmName}
                        onChange={(e) => setFirmName(e.target.value)}
                        placeholder="e.g. Acme Wealth Management"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: '#0B0F14',
                          border: '1px solid #2A3550',
                          borderRadius: 8,
                          color: '#F0F4FF',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: 11, display: 'block', marginBottom: 4 }}>
                        YOUR NAME ON REPORTS
                      </label>
                      <input
                        value={advisorName}
                        onChange={(e) => setAdvisorName(e.target.value)}
                        placeholder="e.g. John Smith, CFA"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: '#0B0F14',
                          border: '1px solid #2A3550',
                          borderRadius: 8,
                          color: '#F0F4FF',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ color: '#94A3B8', fontSize: 11, display: 'block', marginBottom: 4 }}>
                        FIRM LOGO (PNG, recommended 300×100px)
                      </label>
                      <input
                        type="file"
                        accept="image/png,image/svg+xml,image/jpeg"
                        onChange={handleLogoUpload}
                        style={{ color: '#F0F4FF', fontSize: 12 }}
                      />
                      {logoBase64 && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:image/png;base64,${logoBase64}`}
                          style={{ height: 40, marginTop: 8, borderRadius: 4 }}
                          alt="Logo preview"
                        />
                      )}
                    </div>

                    <div>
                      <label style={{ color: '#94A3B8', fontSize: 11, display: 'block', marginBottom: 4 }}>
                        BRAND COLOUR
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="color"
                          value={brandColor}
                          onChange={(e) => setBrandColor(e.target.value)}
                          style={{ width: 40, height: 32, cursor: 'pointer', border: 'none' }}
                        />
                        <span style={{ color: '#64748B', fontSize: 12 }}>{brandColor}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: '#94A3B8', fontSize: 13, margin: '0 0 24px' }}>
                You are set up as an individual investor. You can add firm details later in Settings.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'transparent',
                  border: '1px solid #2A3550',
                  borderRadius: 8,
                  color: '#64748B',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                style={{
                  flex: 2,
                  padding: '12px',
                  background: '#1EB8CC',
                  color: '#0B0F14',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 style={{ color: '#F0F4FF', fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>
              You are ready
            </h2>
            <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 24px' }}>
              Here is how your reports will appear:
            </p>

            <div
              style={{
                background: '#0B0F14',
                borderRadius: 8,
                border: '1px solid #2A3550',
                padding: 16,
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                {logoBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`data:image/png;base64,${logoBase64}`} style={{ height: 32 }} alt="Firm logo" />
                ) : (
                  <div style={{ color: '#1EB8CC', fontWeight: 700, fontSize: 16 }}>
                    {firmName || 'NeuFin Intelligence'}
                  </div>
                )}
                <div style={{ color: '#64748B', fontSize: 10 }}>PORTFOLIO INTELLIGENCE REPORT</div>
              </div>
              <div style={{ height: 1, background: '#2A3550', marginBottom: 12 }} />
              <div style={{ color: '#64748B', fontSize: 11 }}>
                Prepared by: {(advisorName || name).trim() || 'You'} · {firmName || 'NeuFin Intelligence'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleComplete()}
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                background: loading ? '#2A3550' : '#1EB8CC',
                color: loading ? '#64748B' : '#0B0F14',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Setting up...' : 'Start Analysing Portfolios'}
            </button>

            <p style={{ color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
              You can update your branding anytime in Settings
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
