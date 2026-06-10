export default function DashboardLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400"
        aria-hidden
      />
      <p className="text-sm text-slate-400">Carregando dashboard…</p>
    </div>
  );
}
