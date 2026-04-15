// 6 pulsing terminal-style cards matching the Swarm analysis layout
export default function SwarmSkeleton() {
  return (
    <div className="max-w-screen-xl mx-auto w-full px-4 py-6 space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="shimmer h-6 w-48 rounded" />
          <div className="shimmer h-3 w-64 rounded" />
        </div>
        <div className="shimmer h-9 w-28 rounded-lg" />
      </div>

      {/* 6 agent cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="data-card border border-[#E2E8F0] rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="shimmer h-4 w-28 rounded" />
              <div className="shimmer h-5 w-12 rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="shimmer h-3 w-full rounded" />
              <div className="shimmer h-3 w-4/5 rounded" />
              <div className="shimmer h-3 w-3/5 rounded" />
            </div>
            <div className="shimmer h-1 w-full rounded-full" />
            <div className="flex justify-between">
              <div className="shimmer h-3 w-16 rounded" />
              <div className="shimmer h-3 w-10 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Consensus bar */}
      <div className="data-card border border-[#E2E8F0] rounded-xl p-5 space-y-3">
        <div className="shimmer h-4 w-40 rounded" />
        <div className="shimmer h-8 w-full rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="shimmer h-3 w-16 rounded" />
              <div className="shimmer h-6 w-24 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
