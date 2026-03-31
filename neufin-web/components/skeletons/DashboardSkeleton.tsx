// Mirrors the dashboard layout: top chart, 3-column row, bottom pie
export default function DashboardSkeleton() {
  return (
    <div className="max-w-screen-xl mx-auto w-full px-4 py-4 flex flex-col gap-4">

      {/* Portfolio value line chart */}
      <div className="glass-card-dark rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="space-y-2">
            <div className="shimmer h-3 w-32 rounded" />
            <div className="shimmer h-7 w-40 rounded" />
          </div>
          <div className="shimmer h-5 w-14 rounded" />
        </div>
        <div className="shimmer rounded-lg h-32 w-full" />
      </div>

      {/* Three-column row */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-4">

        {/* Holdings list */}
        <div className="glass-card-dark rounded-xl p-5 flex flex-col gap-3">
          <div className="shimmer h-3 w-24 rounded" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <div className="shimmer h-4 w-16 rounded" />
                <div className="shimmer h-4 w-20 rounded" />
              </div>
              <div className="shimmer h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>

        {/* Candlestick chart */}
        <div className="glass-card-dark rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="shimmer h-6 w-16 rounded" />
            <div className="shimmer h-4 w-12 rounded" />
          </div>
          <div className="shimmer rounded-lg flex-1 min-h-[320px]" />
        </div>

        {/* AI Insights */}
        <div className="glass-card-dark rounded-xl p-5 flex flex-col gap-4">
          <div className="shimmer h-3 w-32 rounded" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="shimmer h-3 w-full rounded" />
            ))}
          </div>
          <div className="shimmer h-3 w-24 rounded mt-2" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="shimmer h-3 w-5/6 rounded" />
            ))}
          </div>
          <div className="mt-auto space-y-2">
            <div className="shimmer h-9 w-full rounded-lg" />
            <div className="shimmer h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>

      {/* Sector pie */}
      <div className="glass-card-dark rounded-xl p-5">
        <div className="shimmer h-3 w-32 rounded mb-4" />
        <div className="shimmer h-48 rounded-lg" />
      </div>
    </div>
  )
}
