'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
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
  const [open, setOpen] = useState(false);
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
      <Button type="button" variant="danger-outline" onClick={() => setOpen(true)}>
        Excluir host
      </Button>

      <ConfirmDialog
        open={open}
        title="Confirmar exclusão"
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
          </>
        }
      />
    </>
  );
}
