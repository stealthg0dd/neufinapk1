'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function PartnerUsagePage() {
  const params = useParams()
  const id = String(params.id || '')

  return (
    <div className="p-6 max-w-2xl space-y-3">
      <Link href="/admin/partners" className="text-sm text-sky-400 hover:underline">
        ← Partners
      </Link>
      <h1 className="text-2xl font-semibold text-white">Partner usage</h1>
      <p className="text-sm text-zinc-500">
        Partner ID <code className="text-zinc-300">{id}</code>. Detailed per-key charts can be added
        against <code className="text-zinc-300">api_keys_daily_usage</code> from the API layer.
      </p>
    </div>
  )
}
