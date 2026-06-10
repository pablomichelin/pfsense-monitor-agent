'use client';

export function AdminSectionMessage({
  section,
  activeSection,
  status,
  message,
}: {
  section: string;
  activeSection?: string;
  status?: string;
  message?: string;
}) {
  if (!message || activeSection !== section) {
    return null;
  }

  const tone =
    status === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-200';

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${tone}`}>
      {message}
    </div>
  );
}
