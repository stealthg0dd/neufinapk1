'use client'

import { useState } from 'react'

export default function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="flex-1 btn-outline text-sm py-3 flex items-center justify-center gap-2"
    >
      {copied ? '✓ Copied!' : '🔗 Copy link'}
    </button>
  )
}
