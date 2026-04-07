import Link from 'next/link'

export default function DashboardReportsPage() {
  return (
    <div className="border border-amber-500/20 bg-[#0F1420] rounded-lg p-6 hover:border-amber-500/40 transition-all duration-200 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
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

