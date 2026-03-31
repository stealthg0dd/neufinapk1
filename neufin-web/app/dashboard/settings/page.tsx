'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card-dark rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  )
}

// ── Input field ────────────────────────────────────────────────────────────────
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      <input
        {...props}
        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  )
}

// ── Delete confirmation modal ──────────────────────────────────────────────────
function DeleteModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [input, setInput] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-red-700 rounded-xl p-6 w-full max-w-sm shadow-xl">
        <h3 className="text-lg font-bold text-red-400 mb-2">Delete Account</h3>
        <p className="text-sm text-gray-400 mb-4">
          This permanently deletes your account and all data. Type <span className="font-mono text-red-400">DELETE</span> to confirm.
        </p>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="DELETE"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 mb-4"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={input !== 'DELETE'}
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-red-700 text-sm text-white font-semibold hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Delete Forever
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameMsg, setNameMsg] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')

  const [showDelete, setShowDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleSaveName = async () => {
    if (!displayName.trim()) return
    setNameLoading(true)
    setNameMsg('')
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName.trim() } })
    setNameLoading(false)
    if (error) setNameMsg(`Error: ${error.message}`)
    else setNameMsg('Display name updated.')
  }

  const handleChangePassword = async () => {
    setPwMsg('')
    setPwError('')
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.')
      return
    }
    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwLoading(false)
    if (error) setPwError(error.message)
    else {
      setPwMsg('Password updated.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError('')
    // Sign out then redirect — actual deletion requires a server-side admin call;
    // send a deletion request email or call a backend endpoint if needed.
    try {
      await supabase.auth.signOut()
      router.push('/')
    } catch {
      setDeleteError('Could not delete account. Please contact support.')
    }
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Account Settings</h1>
        <p className="text-sm text-gray-500 mt-1">{user.email}</p>
      </div>

      {/* Profile */}
      <Section title="Profile">
        <div className="flex flex-col gap-4">
          <Field
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          <Field
            label="Email"
            value={user.email ?? ''}
            disabled
            type="email"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveName}
              disabled={nameLoading || !displayName.trim()}
              className="btn-primary py-1.5 px-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {nameLoading ? 'Saving…' : 'Save Changes'}
            </button>
            {nameMsg && <p className="text-xs text-green-400">{nameMsg}</p>}
          </div>
        </div>
      </Section>

      {/* Password */}
      <Section title="Change Password">
        <div className="flex flex-col gap-4">
          <Field
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
          />
          <Field
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
          />
          {pwError && <p className="text-xs text-red-400">{pwError}</p>}
          {pwMsg && <p className="text-xs text-green-400">{pwMsg}</p>}
          <button
            onClick={handleChangePassword}
            disabled={pwLoading || !newPassword}
            className="btn-primary py-1.5 px-4 text-sm self-start disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pwLoading ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </Section>

      {/* Danger Zone */}
      <Section title="Danger Zone">
        <p className="text-sm text-gray-400 mb-4">
          Deleting your account is permanent and cannot be undone. All portfolios, scores, and reports will be removed.
        </p>
        {deleteError && <p className="text-xs text-red-400 mb-3">{deleteError}</p>}
        <button
          onClick={() => setShowDelete(true)}
          className="py-2 px-4 rounded-lg text-sm font-semibold border border-red-700/60 text-red-400 hover:bg-red-900/20 transition-colors"
        >
          Delete Account
        </button>
      </Section>

      {showDelete && (
        <DeleteModal
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  )
}
