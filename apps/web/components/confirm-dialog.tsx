'use client';

import { useEffect, useId } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const toneStyles = {
  danger: {
    border: 'border-rose-500/30',
    title: 'text-rose-200',
    confirm:
      'border-rose-500/60 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30',
  },
  warning: {
    border: 'border-amber-500/30',
    title: 'text-amber-200',
    confirm:
      'border-amber-500/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30',
  },
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const styles = toneStyles[tone];

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        onCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`mx-4 w-full max-w-md rounded-xl border bg-slate-900 p-6 shadow-xl ${styles.border}`}
      >
        <h2 id={titleId} className={`font-display text-lg ${styles.title}`}>
          {title}
        </h2>
        <div className="mt-3 text-sm text-slate-300">{description}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${styles.confirm}`}
          >
            {loading ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
