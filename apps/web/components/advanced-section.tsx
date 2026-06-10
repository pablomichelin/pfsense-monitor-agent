export function AdvancedSection({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-xl border border-slate-700/80 bg-slate-950/30 p-5"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-display text-lg font-semibold text-white">{title}</p>
            {description ? (
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            ) : null}
          </div>
          <span className="rounded-md border border-slate-600/80 px-2.5 py-0.5 text-xs text-slate-300">
            Avancado
          </span>
        </div>
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}
