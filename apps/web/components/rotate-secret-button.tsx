'use client';

import { useState } from 'react';
import { rotateNodeSecretAction } from '@/lib/admin';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Props = {
  nodeId: string;
  nodeUid: string;
};

export function RotateSecretButton({ nodeId, nodeUid }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set('node_id', nodeId);
      await rotateNodeSecretAction(formData);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 transition hover:border-amber-400/50"
      >
        Rotacionar secret
      </button>

      <ConfirmDialog
        open={open}
        title="Rotacionar credencial do agente"
        tone="warning"
        confirmLabel="Rotacionar"
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
              A credencial atual deixara de funcionar imediatamente. Sera necessario
              reinstalar ou atualizar o agente com o novo secret.
            </p>
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 font-mono text-sm text-slate-200">
              <span className="text-slate-500">node_uid:</span> {nodeUid}
            </div>
          </>
        }
      />
    </>
  );
}
