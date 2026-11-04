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
      return 'Aguardando retirada pelo agente';
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
  const [lookupId, setLookupId] = useState('');
  const [recovered, setRecovered] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
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
      setPollError(null);
      setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
    } catch {
      setPollError('Não foi possível atualizar o acompanhamento. Os últimos resultados foram mantidos; isso não significa falha da atualização do pacote.');
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
            {recovered ? 'Lote consultado (somente comandos criados; ignorados não fazem parte do lote):' : 'Lote criado:'} {initialResponse.summary.enqueued} enfileirado(s),{' '}
            {initialResponse.summary.skipped} ignorado(s), {initialResponse.summary.failed}{' '}
            falha(s) imediata(s).
            {batchId ? (
              <>
                {' '}
                ID <span className="break-all">{batchId}</span>
              </>
            ) : null}
          </Alert>

          {batchStatus ? (
            <p className="text-sm text-slate-300">
              Progresso do lote: {batchStatus.batch.succeeded_count ?? 0} concluído(s),{' '}
              {batchStatus.batch.failed_count ?? 0} falha(s),{' '}
              {batchStatus.batch.expired_count ?? 0} expirado(s),{' '}
              {batchStatus.nodes.filter((node) => ['pending', 'picked_up', 'running'].includes(node.status)).length} aguardando,{' '}
              {batchStatus.batch.cancelled_count ?? 0} cancelado(s) — {' '}
              <Badge variant={batchFinished ? 'neutral' : 'warning'}>
                {batchFinished ? 'Finalizado' : 'Aguardando equipamentos'}
              </Badge>
            </p>
          ) : null}

          {pollError ? <Alert variant="warning">{pollError}</Alert> : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <Button type="button" variant="secondary" size="sm" onClick={() => void refreshBatchStatus()}>Atualizar resultados</Button>
            {updatedAt ? <span>Última consulta: {updatedAt} (Brasília)</span> : null}
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Resultado atual por firewall">
            {initialResponse.results.map((item) => {
              const live = liveStatusByNodeId.get(item.node_id);
              const label = item.hostname ?? item.node_id.slice(0, 8);
              const status = live?.status;
              return <li key={item.node_id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 break-all font-medium text-fg">{label}</span>
                  <Badge variant={status === 'succeeded' ? 'success' : ['failed', 'expired'].includes(status ?? '') ? 'danger' : status ? 'warning' : 'neutral'}>{live ? mapCommandStatusLabel(live.status) : item.outcome === 'enqueued' ? 'Aguardando confirmação' : mapOutcomeLabel(item.outcome)}</Badge>
                </div>
                {status === 'pending' ? <p className="text-xs text-fg-muted">O firewall ainda não retirou o comando. A atualização não começou neste equipamento.</p> : null}
                {(live?.error_message || item.reason) ? <p className="break-words text-xs text-fg-muted">{live?.error_message ?? mapSkipReason(item.reason)}</p> : null}
                <details className="text-xs text-fg-muted"><summary className="cursor-pointer">Detalhes do envio</summary>Resultado inicial: {mapOutcomeLabel(item.outcome)}{live ? <p>Comando: {live.command_id}</p> : null}</details>
              </li>;
            })}
          </ul>

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
          <details className="w-full text-sm text-fg-muted">
            <summary className="cursor-pointer">Consultar lote existente sem reenviar</summary>
            <label className="mt-2 block">ID do lote<input className="mt-1 w-full rounded border border-border bg-surface p-2 text-fg" value={lookupId} onChange={(event) => setLookupId(event.target.value)} /></label>
            <Button type="button" variant="secondary" disabled={pending || !lookupId.trim()} onClick={() => startTransition(async () => {
              try {
                const status = await pollCommandBatchStatusAction(lookupId.trim());
                if (status.batch.command_type !== 'package_upgrade') throw new Error('Este lote não é de atualização de pacote.');
                setInitialResponse({generated_at: status.generated_at, published_version: '', batch: status.batch,
                  summary: {total: status.nodes.length, enqueued: status.nodes.length, skipped: 0, failed: 0},
                  results: status.nodes.map((node) => ({node_id: node.node_id, hostname: selectedNodes.find((selected) => selected.id === node.node_id)?.hostname ?? null, outcome: 'enqueued', reason: null, command_id: node.command_id, status: node.status}))});
                setBatchStatus(status); setRecovered(true); setError(null);
              } catch (err) {setError(err instanceof Error ? err.message : 'Não foi possível consultar o lote.');}
            })}>Consultar lote</Button>
          </details>
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
                    setRecovered(false);
                    setInitialResponse(response);
                    setError(null);
                    setShowConfirm(false);
                    setConfirmText('');
                    setBatchStatus(null);
                    setPollError(null);
                    setUpdatedAt(null);
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
