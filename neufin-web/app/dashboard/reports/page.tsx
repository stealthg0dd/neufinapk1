import Link from 'next/link'

export default function DashboardReportsPage() {
  return (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
      <h1 className="text-xl font-semibold mb-2">Reports</h1>
      <p className="text-sm text-[var(--text-2)] mb-4">
        Generate and manage advisor-grade reports from your latest analysis and portfolio metrics.
      </p>
      <Link href="/vault" className="text-[var(--amber)] text-sm hover:underline">
        Open Reports Vault →
      </Link>
    </div>
  )
}

