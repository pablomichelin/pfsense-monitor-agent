'use client';

import { useState, useTransition } from 'react';
import { createBackupBatchAction } from '@/lib/operational-actions-actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Props = {
  nodeIds: string[];
  clientId?: string;
  label?: string;
};

export function FleetBatchBackupPanel({ nodeIds, clientId, label }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  if (nodeIds.length === 0) {
    return null;
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-display text-base text-white">Backup em lote</h3>
        <p className="mt-1 text-sm text-slate-400">
          Enfileira <code className="text-slate-300">config_backup_now</code> para{' '}
          {nodeIds.length} firewall(s) visíveis neste filtro.
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {result ? <Alert variant="success">{result}</Alert> : null}

      {!showConfirm ? (
        <Button type="button" variant="secondary" onClick={() => setShowConfirm(true)}>
          Solicitar backup em lote…
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Confirma backup imediato para {nodeIds.length} node(s)? Firewalls offline ou com
            agente antigo podem falhar parcialmente.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    const response = await createBackupBatchAction({
                      node_ids: nodeIds,
                      client_id: clientId,
                      label: label ?? 'Inventário — backup em lote',
                    });
                    const enqueued = response.nodes.length;
                    setResult(
                      `Lote ${response.batch.batch_id.slice(0, 8)}… — ${enqueued}/${nodeIds.length} enfileirados.`,
                    );
                    setError(null);
                    setShowConfirm(false);
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : 'Falha ao criar lote de backup',
                    );
                  }
                });
              }}
            >
              Confirmar lote
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setShowConfirm(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
