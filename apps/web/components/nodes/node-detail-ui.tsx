export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 font-display text-2xl text-white">{value}</p>
    </div>
  );
}

export function BootstrapField({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string | null;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all text-sm text-cyan-300 hover:text-cyan-200"
        >
          {value}
        </a>
      ) : (
        <p className="mt-2 break-all text-sm text-slate-200">{value}</p>
      )}
    </div>
  );
}

export function CommandBlock({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 font-mono text-xs leading-relaxed text-cyan-100">
      {value}
    </pre>
  );
}
