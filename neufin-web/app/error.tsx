'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Neufin error boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-5 text-center px-6">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
      <p className="text-gray-500 text-sm max-w-xs">
        An unexpected error occurred. This may be a temporary issue — please try again.
      </p>
      <div className="flex gap-3">
        <button onClick={reset} className="btn-primary px-8 py-3">
          Try again
        </button>
        <Link href="/" className="btn-outline px-8 py-3">
          Go home
        </Link>
      </div>
      {error.digest && (
        <p className="text-xs text-gray-700 font-mono mt-2">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
