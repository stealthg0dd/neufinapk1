'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { claimAnonymousRecord } from '@/lib/api'

type Method = 'magic' | 'google' | 'password'

async function claimPendingRecord(token: string) {
  if (typeof window === 'undefined') return
  const raw = localStorage.getItem('dnaResult')
  if (!raw) return
  try {
    const parsed = JSON.parse(raw)
    const recordId = parsed?.record_id
    if (recordId && !parsed?.user_id_claimed) {
      await claimAnonymousRecord(recordId, token)
      localStorage.setItem('dnaResult', JSON.stringify({ ...parsed, user_id_claimed: true }))
    }
  } catch {}
}

const fadeUp = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

export default function AuthPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [method,   setMethod]   = useState<Method>('magic')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [mode,     setMode]     = useState<'login' | 'signup'>('login')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [sent,     setSent]     = useState(false)

  const next = searchParams.get('next') || '/vault'
  const hasPending = typeof window !== 'undefined' && (() => {
    try { return !!(JSON.parse(localStorage.getItem('dnaResult') || 'null')?.record_id) } catch { return false }
  })()

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.access_token) {
        await claimPendingRecord(session.access_token)
        router.replace(next)
      }
    })
    return () => listener.subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next])

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  async function handleGoogle() {
    setLoading(true); setError('')
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (err) { setError(err.message); setLoading(false) }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        setSent(true)
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        if (data.session?.access_token) await claimPendingRecord(data.session.access_token)
        router.replace(next)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <AuthNav />
        <main className="flex-1 flex items-center justify-center p-6">
          <motion.div variants={fadeUp} initial="hidden" animate="visible"
            className="w-full max-w-sm card text-center space-y-4"
          >
            <div className="text-5xl">✉️</div>
            <h1 className="text-xl font-bold text-white">Check your email</h1>
            <p className="text-gray-400 text-sm">
              {method === 'magic'
                ? `We sent a magic login link to ${email}. Click it to sign in — no password needed.`
                : `We sent a confirmation link to ${email}. Confirm then sign in.`}
            </p>
            {hasPending && (
              <p className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                🔗 Your portfolio analysis will be linked to your account when you click the link.
              </p>
            )}
            <button onClick={() => { setSent(false); setError(''); setEmail('') }}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              ← Try a different email
            </button>
          </motion.div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <AuthNav />
      <main className="flex-1 flex items-center justify-center p-6">
        <motion.div variants={fadeUp} initial="hidden" animate="visible"
          className="w-full max-w-sm space-y-6"
        >
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              {mode === 'login' ? 'Welcome back' : 'Create your Vault'}
            </h1>
            <p className="text-gray-500 text-sm">
              {hasPending
                ? '🔗 Sign in to save your portfolio analysis and access it on any device.'
                : 'Save your DNA scores and access your reports anywhere.'}
            </p>
          </div>

          {/* Method tabs */}
          <div className="flex bg-gray-900 rounded-xl p-1 border border-gray-800">
            {([
              { id: 'magic',    label: '✉️ Magic Link' },
              { id: 'google',   label: '🔵 Google' },
              { id: 'password', label: '🔑 Password' },
            ] as const).map(m => (
              <button key={m.id} onClick={() => { setMethod(m.id); setError('') }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors
                  ${method === m.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {method === 'magic' && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <EmailField value={email} onChange={setEmail} />
              <SubmitBtn loading={loading}>Send Magic Link →</SubmitBtn>
              <p className="text-center text-xs text-gray-600">No password needed · one-click sign in via email</p>
            </form>
          )}

          {method === 'google' && (
            <div className="space-y-4">
              <button type="button" onClick={handleGoogle} disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl
                  bg-white text-gray-900 font-semibold text-sm hover:bg-gray-100 transition-colors
                  disabled:opacity-50 disabled:cursor-wait"
              >
                {loading
                  ? <span className="w-4 h-4 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
                  : <GoogleIcon />}
                Continue with Google
              </button>
              <p className="text-center text-xs text-gray-600">One tap · your Google account stays private</p>
            </div>
          )}

          {method === 'password' && (
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="flex gap-2 text-xs">
                {(['login', 'signup'] as const).map(m => (
                  <button key={m} type="button" onClick={() => { setMode(m); setError('') }}
                    className={`flex-1 py-2 rounded-lg border transition-colors ${
                      mode === m
                        ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                        : 'border-gray-800 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {m === 'login' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>
              <EmailField value={email} onChange={setEmail} />
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Password</label>
                <input type="password" required minLength={6} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  className="input w-full" autoComplete="current-password" />
              </div>
              <SubmitBtn loading={loading}>
                {mode === 'login' ? 'Sign in →' : 'Create account →'}
              </SubmitBtn>
            </form>
          )}

          <p className="text-center text-xs text-gray-600">
            By continuing you agree to our{' '}
            <Link href="/privacy" className="text-gray-500 hover:text-gray-300 underline underline-offset-2">
              Privacy Policy
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  )
}

function AuthNav() {
  return (
    <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-gray-400 hover:text-white text-sm transition-colors">← Back</Link>
        <Link href="/" className="text-xl font-bold text-gradient">Neufin</Link>
        <span className="w-12" />
      </div>
    </nav>
  )
}

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">Email address</label>
      <input type="email" required value={value} onChange={e => onChange(e.target.value)}
        placeholder="you@example.com" className="input w-full" autoComplete="email" />
    </div>
  )
}

function SubmitBtn({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading}
      className={`btn-primary w-full py-3.5 flex items-center justify-center gap-2 ${loading ? 'opacity-50 cursor-wait' : ''}`}
    >
      {loading
        ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        : children}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
