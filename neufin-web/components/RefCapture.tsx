'use client'

/**
 * Drop this into any page that might receive a ?ref= parameter
 * (landing page, /upload, etc.). It silently persists the code to
 * localStorage so the checkout flow can pick it up automatically.
 *
 * Usage: <RefCapture />
 */
import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { captureReferral } from '@/lib/api'

function RefCaptureInner() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) captureReferral(ref)
  }, [searchParams])

  return null
}

export default function RefCapture() {
  return (
    <Suspense fallback={null}>
      <RefCaptureInner />
    </Suspense>
  )
}
