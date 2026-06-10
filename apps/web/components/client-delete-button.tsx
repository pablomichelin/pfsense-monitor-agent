'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { DeleteClientResult } from '@/lib/admin';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Props = {
  clientId: string;
  clientName: string;
  returnTo: string;
  deleteClientAction: (formData: FormData) => Promise<DeleteClientResult>;
};

export function ClientDeleteButton({
  clientId,
  clientName,
  returnTo,
  deleteClientAction,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const DELETE_TIMEOUT_MS = 35000;

  function handleConfirm() {
    const formData = new FormData();
    formData.set('client_id', clientId);
    formData.set('returnTo', returnTo);
    const baseUrl = returnTo.replace(/\?.*$/, '');

    startTransition(async () => {
      try {
        const result = await Promise.race([
          deleteClientAction(formData),
          new Promise<DeleteClientResult>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    'Tempo esgotado. O servidor pode estar lento. Tente novamente.',
                  ),
                ),
              DELETE_TIMEOUT_MS,
            ),
          ),
        ]);
        if (result.ok) {
          router.push(result.redirectUrl);
        } else {
          router.push(
            `${baseUrl}?section=client-delete&status=error&message=${encodeURIComponent(result.error)}`,
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Falha ao excluir cliente';
        router.push(
          `${baseUrl}?section=client-delete&status=error&message=${encodeURIComponent(message)}`,
        );
      } finally {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
      >
        {isPending ? 'Excluindo...' : 'Excluir cliente'}
      </button>

      <ConfirmDialog
        open={open}
        title="Excluir cliente"
        confirmLabel="Excluir"
        loading={isPending}
        onCancel={() => {
          if (!isPending) {
            setOpen(false);
          }
        }}
        onConfirm={handleConfirm}
        description={
          <>
            <p>
              Esta acao e irreversivel. O cliente so pode ser excluido sem firewalls
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
