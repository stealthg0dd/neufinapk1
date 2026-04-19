export default function DashboardLoading() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-6">
      <div className="h-10 w-48 rounded-lg bg-slate-200" />
      <div className="h-36 rounded-xl bg-slate-100" />
      <div className="h-12 rounded-lg bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-24 rounded-xl bg-slate-100" />
        <div className="h-24 rounded-xl bg-slate-100" />
        <div className="h-24 rounded-xl bg-slate-100" />
      </div>
      <div className="h-64 rounded-2xl bg-slate-100" />
    </div>
  );
}
