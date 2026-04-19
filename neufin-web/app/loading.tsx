/**
 * Route-level fallback while server segments load — improves perceived responsiveness.
 */
export default function RootLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-white px-6">
      <div
        className="h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden
      />
      <p className="text-sm font-medium text-slate2">Loading NeuFin…</p>
    </div>
  );
}
