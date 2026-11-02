'use client';

import { useEffect, useId, useRef, useState } from 'react';
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
  const descriptionId = useId();
  const styles = toneStyles[tone];
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) {
      return;
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const otherRoots = [...document.body.children].filter(
      (element) => element !== dialogRef.current && !element.contains(dialogRef.current),
    ) as HTMLElement[];
    const previousInert = otherRoots.map((element) => element.inert);
    otherRoots.forEach((element) => { element.inert = true; });
    cancelRef.current?.focus();

    return () => {
      otherRoots.forEach((element, index) => { element.inert = previousInert[index]; });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mounted, open]);

  useEffect(() => {
    if (!open || !mounted) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        event.preventDefault();
        onCancel();
      } else if (event.key === 'Tab') {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [])];
        if (focusable.length === 0) {
          event.preventDefault();
          dialogRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, mounted, onCancel, open]);

  if (!open || !mounted) {
    return null;
  }

  return createPortal(
    <div
      ref={dialogRef}
      className="theme-overlay fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
    >
      <div
        className={`mx-4 w-full max-w-md rounded-xl border bg-surface-elevated p-6 shadow-panel ${styles.border}`}
      >
        <h2 id={titleId} className={`font-display text-lg ${styles.title}`}>
          {title}
        </h2>
        <div id={descriptionId} className="mt-3 text-sm text-fg-muted">{description}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
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
