'use client';

import { useState } from 'react';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { deleteClientAction } from '@/lib/admin';

type Props = {
  clientId: string;
  clientName: string;
  returnTo?: string;
};

export function ClientDeleteButton({ clientId, clientName, returnTo }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await deleteClientAction(clientId, returnTo);
    } catch (err) {
      if (isRedirectError(err)) {
        throw err;
      }
      setError(
        err instanceof Error ? err.message : 'Não foi possível excluir o cliente.',
      );
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={loading}
        className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
      >
        {loading ? 'Excluindo...' : 'Excluir cliente'}
      </button>

      {error ? (
        <p className="mt-2 text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={open}
        title="Excluir cliente"
        confirmLabel="Excluir"
        loading={loading}
        onCancel={() => {
          if (!loading) {
            setOpen(false);
          }
        }}
        onConfirm={handleConfirm}
        description={
          <>
            <p>
              Esta ação é irreversível. O cliente só pode ser excluído sem firewalls
              vinculados.
            </p>
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
              {clientName}
            </div>
          </>
        }
      />
    </>
  );
}
