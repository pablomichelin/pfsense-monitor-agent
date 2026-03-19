'use client';

import { useState } from 'react';
import { deleteNodeAction } from '@/lib/admin';

type Props = {
  nodeId: string;
  nodeUid: string;
  displayName: string | null;
  hostname: string;
};

export function DeleteNodeButton({
  nodeId,
  nodeUid,
  displayName,
  hostname,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const label = displayName ?? hostname;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await deleteNodeAction(nodeId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="rounded-full border border-rose-500/50 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 transition hover:border-rose-400/60 hover:bg-rose-500/20"
      >
        Excluir host
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="mx-4 w-full max-w-md rounded-xl border border-rose-500/30 bg-slate-900 p-6 shadow-xl">
            <h2
              id="delete-modal-title"
              className="font-display text-lg text-rose-200"
            >
              Confirmar exclusão
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              Esta ação é <strong className="text-rose-300">irreversível</strong>.
              O host será removido permanentemente do sistema, incluindo
              credenciais, heartbeats e alertas.
            </p>
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 font-mono text-sm text-slate-200">
              <p>
                <span className="text-slate-500">Host:</span> {label}
              </p>
              <p className="mt-1">
                <span className="text-slate-500">node_uid:</span> {nodeUid}
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="rounded-lg border border-rose-500/60 bg-rose-500/20 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/30 disabled:opacity-50"
              >
                {loading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
