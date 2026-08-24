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
      className="rounded-xl border border-border bg-surface-soft/60 p-5"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-display text-lg font-semibold text-fg">{title}</p>
            {description ? (
              <p className="mt-1 text-sm text-fg-muted">{description}</p>
            ) : null}
          </div>
          <span className="rounded-md border border-border px-2.5 py-0.5 text-xs text-fg-muted">
            Avancado
          </span>
        </div>
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}
