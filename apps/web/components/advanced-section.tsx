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
      className="border-t border-border py-2"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-display text-sm font-semibold text-fg">{title}</p>
            {description ? (
              <p className="mt-1 text-xs text-fg-muted">{description}</p>
            ) : null}
          </div>
          <span className="rounded-md border border-border px-2.5 py-0.5 text-xs text-fg-muted">
            Avançado
          </span>
        </div>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
