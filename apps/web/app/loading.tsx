export default function Loading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
        aria-hidden
      />
      <p className="text-sm text-fg-muted">Carregando…</p>
    </div>
  );
}
