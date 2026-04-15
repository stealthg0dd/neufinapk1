// Pulsing placeholders matching the DNA report sections
export default function ReportSkeleton() {
  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-section space-y-4">

      {/* Hero score circle + type badge */}
      <div className="card text-center space-y-4 py-6">
        <div className="shimmer rounded-full mx-auto" style={{ width: 180, height: 180 }} />
        <div className="shimmer h-4 w-32 rounded mx-auto" />
        <div className="shimmer h-7 w-48 rounded-full mx-auto" />
        <div className="shimmer h-4 w-56 rounded mx-auto" />
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card space-y-2 text-center py-6">
            <div className="shimmer h-3 w-20 rounded mx-auto" />
            <div className="shimmer h-8 w-28 rounded mx-auto" />
          </div>
        ))}
      </div>

      {/* Strengths / Weaknesses */}
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="glass-card rounded-xl p-5 space-y-3">
            <div className="shimmer h-3 w-24 rounded" />
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex gap-2 items-center">
                <div className="shimmer h-3 w-3 rounded-full shrink-0" />
                <div className="shimmer h-3 w-full rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Action plan */}
      <div className="card space-y-2">
        <div className="shimmer h-3 w-40 rounded" />
        <div className="shimmer h-3 w-full rounded" />
        <div className="shimmer h-3 w-5/6 rounded" />
        <div className="shimmer h-3 w-4/5 rounded" />
      </div>

      {/* Holdings table */}
      <div className="card space-y-3">
        <div className="shimmer h-3 w-24 rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between gap-4">
            <div className="shimmer h-4 w-16 rounded" />
            <div className="shimmer h-4 w-12 rounded" />
            <div className="shimmer h-4 w-16 rounded" />
            <div className="shimmer h-4 w-20 rounded" />
            <div className="shimmer h-4 flex-1 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
