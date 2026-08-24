'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  const isTimeout =
    error.message?.includes('cancelada') ||
    error.message?.includes('demorou mais');

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4">
      <div className="max-w-md rounded-xl border border-danger-border bg-danger-muted px-6 py-5 text-center">
        <h2 className="font-display text-lg font-semibold text-danger-fg">
          Algo deu errado
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          {isTimeout
            ? 'O servidor demorou para responder. Tente novamente em instantes.'
            : error.message || 'Erro inesperado.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-primary/50 bg-primary/15 px-4 text-sm font-medium text-primary transition hover:bg-primary/25"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
