'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

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
    border: 'border-danger-border',
    title: 'text-danger-fg',
    confirm:
      'border-danger/60 bg-danger-muted text-danger-fg hover:bg-danger/20',
  },
  warning: {
    border: 'border-warning-border',
    title: 'text-warning-fg',
    confirm:
      'border-warning/60 bg-warning-muted text-warning-fg hover:bg-warning/20',
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
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const styles = toneStyles[tone];

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!open || !mounted) {
    return null;
  }

  return createPortal(
    <div
      className="theme-overlay fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`mx-4 w-full max-w-md rounded-xl border bg-surface-elevated p-6 shadow-panel ${styles.border}`}
      >
        <h2 id={titleId} className={`font-display text-lg ${styles.title}`}>
          {title}
        </h2>
        <div className="mt-3 text-sm text-fg-muted">{description}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-border px-4 py-2 text-sm text-fg-muted transition hover:bg-nav-hover disabled:opacity-50"
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
    </div>,
    document.body,
  );
}
