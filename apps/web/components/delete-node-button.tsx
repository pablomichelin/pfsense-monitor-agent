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
  const [error, setError] = useState<string | null>(null);
  const [needsTechnicianConfirm, setNeedsTechnicianConfirm] = useState(false);

  const label = displayName ?? hostname;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await deleteNodeAction(nodeId, needsTechnicianConfirm);
      if (result && !result.ok) {
        setError(result.error);
        setNeedsTechnicianConfirm(Boolean(result.requiresTechnicianConfirm));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="danger-outline"
        onClick={() => {
          setError(null);
          setNeedsTechnicianConfirm(false);
          setOpen(true);
        }}
      >
        Excluir host
      </Button>

      <ConfirmDialog
        open={open}
        title={needsTechnicianConfirm ? 'Técnico vinculado' : 'Confirmar exclusão'}
        confirmLabel={needsTechnicianConfirm ? 'Excluir mesmo assim' : 'Excluir'}
        tone={needsTechnicianConfirm ? 'warning' : 'danger'}
        loading={loading}
        onCancel={() => {
          if (!loading) {
            setOpen(false);
            setNeedsTechnicianConfirm(false);
            setError(null);
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
            {error ? <p className="mt-4 text-sm text-rose-200">{error}</p> : null}
          </>
        }
      />
    </>
  );
}
