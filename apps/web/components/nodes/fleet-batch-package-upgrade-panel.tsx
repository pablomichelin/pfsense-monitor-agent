'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type {
  CommandBatchResponse,
  PackageUpgradeBatchResponse,
} from '@/lib/api';
import {
  createPackageUpgradeBatchAction,
  pollCommandBatchStatusAction,
} from '@/lib/package-upgrade';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui';

const POLL_INTERVAL_MS = 12_000;
const MIN_AGENT_VERSION = '0.4.6';

type SelectedNode = {
  id: string;
  hostname: string;
  display_name: string | null;
  agent_version: string | null;
};

type Props = {
  selectedNodes: SelectedNode[];
  clientId?: string;
  targetPackageVersion: string | null;
  canRunPackageUpgrade: boolean;
  onClearSelection?: () => void;
};

function mapOutcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'enqueued':
      return 'Enfileirado';
    case 'skipped':
      return 'Ignorado';
    case 'failed':
      return 'Falha';
    default:
      return outcome;
  }
}

function mapCommandStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pendente';
    case 'picked_up':
      return 'Aceito pelo agente';
    case 'running':
      return 'Em execução';
    case 'succeeded':
      return 'Concluído';
    case 'failed':
      return 'Falhou';
    case 'expired':
      return 'Expirado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
}

function mapSkipReason(reason: string | null): string {
  if (!reason) {
    return '—';
  }

  switch (reason) {
    case 'node not found':
      return 'Firewall não encontrado';
    case 'node heartbeat is not recent':
      return 'Heartbeat não recente';
    case 'agent already at target version':
      return 'Já está na versão publicada';
    default:
      if (reason.startsWith('agent version below minimum')) {
        return `Agente incompatível (requer ${MIN_AGENT_VERSION}+)`;
      }
      if (reason.includes('active package_upgrade command already exists')) {
        return 'Upgrade já em andamento';
      }
      return reason;
  }
}

export function FleetBatchPackageUpgradePanel({
  selectedNodes,
  clientId,
  targetPackageVersion,
  canRunPackageUpgrade,
  onClearSelection,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [pending, startTransition] = useTransition();
  const [initialResponse, setInitialResponse] =
    useState<PackageUpgradeBatchResponse | null>(null);
  const [batchStatus, setBatchStatus] = useState<CommandBatchResponse | null>(null);

  const confirmEnabled = confirmText.trim().toUpperCase() === 'CONFIRMAR';

  const batchId = initialResponse?.batch?.batch_id ?? null;

  const refreshBatchStatus = useCallback(async () => {
    if (!batchId) {
      return;
    }

    try {
      const next = await pollCommandBatchStatusAction(batchId);
      setBatchStatus(next);
    } catch {
      // polling silencioso
    }
  }, [batchId]);

  useEffect(() => {
    if (!batchId) {
      return;
    }

    void refreshBatchStatus();

    const timer = window.setInterval(() => {
      void refreshBatchStatus();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [batchId, refreshBatchStatus]);

  const liveStatusByNodeId = useMemo(() => {
    const map = new Map<string, CommandBatchResponse['nodes'][number]>();
    for (const node of batchStatus?.nodes ?? []) {
      map.set(node.node_id, node);
    }
    return map;
  }, [batchStatus]);

  const batchFinished =
    batchStatus?.batch.status === 'completed' ||
    batchStatus?.batch.status === 'failed' ||
    batchStatus?.batch.status === 'cancelled';

  if (selectedNodes.length === 0) {
    return null;
  }

  const blockReason = !canRunPackageUpgrade
    ? 'Sem permissão para disparar upgrade de package'
    : !targetPackageVersion
      ? 'Versão publicada indisponível'
      : null;

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="font-display text-base text-fg">Atualizar package em lote</h3>
        <p className="mt-1 text-sm text-slate-400">
          Dispara <code className="text-slate-300">package_upgrade</code> para{' '}
          {selectedNodes.length} firewall(s) selecionado(s)
          {targetPackageVersion ? (
            <>
              {' '}
              → versão <strong className="text-slate-200">{targetPackageVersion}</strong>
            </>
          ) : null}
          .
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {initialResponse ? (
        <div className="space-y-3">
          <Alert variant={initialResponse.summary.enqueued > 0 ? 'success' : 'warning'}>
            Lote criado: {initialResponse.summary.enqueued} enfileirado(s),{' '}
            {initialResponse.summary.skipped} ignorado(s), {initialResponse.summary.failed}{' '}
            falha(s) imediata(s).
            {batchId ? (
              <>
                {' '}
                ID {batchId.slice(0, 8)}…
              </>
            ) : null}
          </Alert>

          {batchStatus ? (
            <p className="text-sm text-slate-300">
              Progresso do lote: {batchStatus.batch.succeeded_count ?? 0} concluído(s),{' '}
              {batchStatus.batch.failed_count ?? 0} falha(s),{' '}
              {batchStatus.batch.expired_count ?? 0} expirado(s) — status{' '}
              <Badge variant={batchFinished ? 'neutral' : 'warning'}>
                {batchStatus.batch.status}
              </Badge>
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Firewall</th>
                  <th className="px-3 py-2">Resultado inicial</th>
                  <th className="px-3 py-2">Status do comando</th>
                  <th className="px-3 py-2">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {initialResponse.results.map((item) => {
                  const live = liveStatusByNodeId.get(item.node_id);
                  const label = item.hostname ?? item.node_id.slice(0, 8);

                  return (
                    <tr key={item.node_id} className="border-b border-slate-900/80 text-slate-200">
                      <td className="px-3 py-2">{label}</td>
                      <td className="px-3 py-2">{mapOutcomeLabel(item.outcome)}</td>
                      <td className="px-3 py-2">
                        {live ? mapCommandStatusLabel(live.status) : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {live?.error_message ??
                          (item.reason ? mapSkipReason(item.reason) : '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {batchFinished ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setInitialResponse(null);
                  setBatchStatus(null);
                  setShowConfirm(false);
                  setConfirmText('');
                  onClearSelection?.();
                }}
              >
                Limpar resultado
              </Button>
            </div>
          ) : null}
        </div>
      ) : !showConfirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={Boolean(blockReason)}
            title={blockReason ?? undefined}
            onClick={() => {
              setError(null);
              setShowConfirm(true);
            }}
          >
            Atualizar package selecionados…
          </Button>
          {blockReason ? (
            <p className="text-xs text-slate-500">{blockReason}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Confirma upgrade remoto do package para {selectedNodes.length} firewall(s)? Firewalls
            offline, desatualizados demais ou já na versão publicada serão ignorados.
          </p>
          <ul className="max-h-40 list-inside list-disc overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
            {selectedNodes.map((node) => (
              <li key={node.id}>{node.display_name ?? node.hostname}</li>
            ))}
          </ul>
          <label className="block text-sm">
            <span className="text-slate-400">Digite CONFIRMAR para continuar:</span>
            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="mt-1 w-full max-w-sm rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending || !confirmEnabled}
              onClick={() => {
                startTransition(async () => {
                  try {
                    const response = await createPackageUpgradeBatchAction({
                      node_ids: selectedNodes.map((node) => node.id),
                      client_id: clientId,
                      label: `Inventário — package upgrade (${selectedNodes.length} nodes)`,
                    });
                    setInitialResponse(response);
                    setError(null);
                    setShowConfirm(false);
                    setConfirmText('');
                    if (response.batch?.batch_id) {
                      const status = await pollCommandBatchStatusAction(
                        response.batch.batch_id,
                      );
                      setBatchStatus(status);
                    }
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Falha ao criar lote de upgrade de package',
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
              onClick={() => {
                setShowConfirm(false);
                setConfirmText('');
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
