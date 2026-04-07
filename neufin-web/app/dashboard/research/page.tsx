import Link from 'next/link'

export default function DashboardResearchPage() {
  return (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
      <h1 className="text-xl font-semibold mb-2">Research</h1>
      <p className="text-sm text-[var(--text-2)] mb-4">
        Live research feed is available in dashboard summary. Open full research notes below.
      </p>
      <Link href="/research" className="text-[var(--amber)] text-sm hover:underline">
        Open Research Hub →
      </Link>
    </div>
  )
}

