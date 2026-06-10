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
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-6 py-5 text-center max-w-md">
        <h2 className="font-display text-lg font-semibold text-rose-200">
          Algo deu errado
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          {isTimeout
            ? 'O servidor demorou para responder. Tente novamente em instantes.'
            : error.message || 'Erro inesperado.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-cyan-400/50 bg-cyan-400/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
