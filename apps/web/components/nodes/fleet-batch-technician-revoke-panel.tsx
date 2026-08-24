'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type {
  CommandBatchResponse,
  TechnicianBatchRevokeResponse,
  TechnicianFleetRevokeResponse,
  TechnicianListItem,
} from '@/lib/api';
import {
  createTechnicianAction,
  createTechnicianBatchRevokeAction,
  createTechnicianFleetRevokeAction,
  listTechniciansAction,
  pollCommandBatchStatusAction,
} from '@/lib/technicians';
import { isValidManagedPfsenseUsername } from '@/lib/pfsense-username';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui';

const POLL_INTERVAL_MS = 12_000;
const MIN_AGENT_VERSION = '0.5.4';

type RevokeMode = 'filter' | 'selection' | 'fleet';

type Props = {
  nodeIds: string[];
  mode?: 'selection' | 'filter';
  totalVisibleCount?: number;
  clientId?: string;
  canManageTechnicians: boolean;
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
    case 'local users snapshot unavailable':
      return 'Snapshot de usuários indisponível (agente 0.5.1+)';
    case 'user not found on firewall':
      return 'Usuário não encontrado no firewall';
    case 'would remove last active admin account':
      return 'Bloqueado — última conta admin';
    case 'reserved username':
      return 'Bloqueado — usuário reservado do pfSense (admin/root)';
    default:
      if (reason.startsWith('agent version below minimum')) {
        return `Agente incompatível (requer ${MIN_AGENT_VERSION}+)`;
      }
      return reason;
  }
}

function collectBatchIds(response: TechnicianBatchRevokeResponse | TechnicianFleetRevokeResponse) {
  const fleetResponse = response as TechnicianFleetRevokeResponse;
  if (fleetResponse.batches?.length) {
    return fleetResponse.batches.map((batch) => batch.batch_id);
  }
  return response.batch?.batch_id ? [response.batch.batch_id] : [];
}

export function FleetBatchTechnicianRevokePanel({
  nodeIds,
  mode = 'filter',
  totalVisibleCount,
  clientId,
  canManageTechnicians,
}: Props) {
  const [technicians, setTechnicians] = useState<TechnicianListItem[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [action, setAction] = useState<'disable' | 'delete'>('disable');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingRevokeMode, setPendingRevokeMode] = useState<RevokeMode>('filter');
  const [confirmText, setConfirmText] = useState('');
  const [pending, startTransition] = useTransition();
  const [createPending, startCreateTransition] = useTransition();
  const [newFullName, setNewFullName] = useState('');
  const [newLoginUsername, setNewLoginUsername] = useState('');
  const [initialResponse, setInitialResponse] = useState<
    TechnicianBatchRevokeResponse | TechnicianFleetRevokeResponse | null
  >(null);
  const [batchStatuses, setBatchStatuses] = useState<CommandBatchResponse[]>([]);

  const confirmEnabled = confirmText.trim().toUpperCase() === 'CONFIRMAR';
  const loginUsernameValid = isValidManagedPfsenseUsername(newLoginUsername);

  const reloadTechnicians = useCallback(async () => {
    const response = await listTechniciansAction('active');
    setTechnicians(response.items);
    if (response.items.length > 0) {
      setTechnicianId((current) => {
        if (current && response.items.some((item) => item.id === current)) {
          return current;
        }
        return response.items[0]!.id;
      });
    }
    return response;
  }, []);

  useEffect(() => {
    if (!canManageTechnicians) {
      return;
    }

    void reloadTechnicians().catch(() => {
      setError('Falha ao carregar lista de técnicos');
    });
  }, [canManageTechnicians, reloadTechnicians]);

  const batchIds = useMemo(
    () => (initialResponse ? collectBatchIds(initialResponse) : []),
    [initialResponse],
  );

  const refreshBatchStatuses = useCallback(async () => {
    if (batchIds.length === 0) {
      return;
    }

    try {
      const nextStatuses = await Promise.all(
        batchIds.map((batchId) => pollCommandBatchStatusAction(batchId)),
      );
      setBatchStatuses(nextStatuses);
    } catch {
      // polling silencioso
    }
  }, [batchIds]);

  useEffect(() => {
    if (batchIds.length === 0) {
      return;
    }

    void refreshBatchStatuses();

    const timer = window.setInterval(() => {
      void refreshBatchStatuses();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [batchIds, refreshBatchStatuses]);

  const liveStatusByNodeId = useMemo(() => {
    const map = new Map<string, CommandBatchResponse['nodes'][number]>();
    for (const batchStatus of batchStatuses) {
      for (const node of batchStatus.nodes ?? []) {
        map.set(node.node_id, node);
      }
    }
    return map;
  }, [batchStatuses]);

  const batchFinished =
    batchStatuses.length > 0 &&
    batchStatuses.every(
      (batchStatus) =>
        batchStatus.batch.status === 'completed' ||
        batchStatus.batch.status === 'failed' ||
        batchStatus.batch.status === 'cancelled',
    );

  if (!canManageTechnicians) {
    return null;
  }

  const usingSelection = mode === 'selection' && nodeIds.length > 0;
  const targetLabel = usingSelection
    ? `${nodeIds.length} firewall(s) selecionado(s)`
    : nodeIds.length > 0
      ? `${nodeIds.length} firewall(s) visíveis neste filtro`
      : 'filtro atual';

  const selectedTechnician = technicians.find((item) => item.id === technicianId);

  const openConfirm = (revokeMode: RevokeMode) => {
    setPendingRevokeMode(revokeMode);
    setShowConfirm(true);
    setConfirmText('');
    setError(null);
  };

  const fleetSummary =
    initialResponse && 'summary' in initialResponse
      ? (initialResponse.summary as TechnicianFleetRevokeResponse['summary'])
      : null;

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="font-display text-base text-fg">Desligamento de técnico</h3>
        <p className="mt-1 text-sm text-slate-400">
          Cadastre o login pfSense do ex-funcionário e revogue o acesso em toda a frota ou só nos
          firewalls selecionados. Requer agente {MIN_AGENT_VERSION}+ com gestão de técnicos habilitada
          no pfSense.
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {info ? <Alert variant="success">{info}</Alert> : null}

      {!initialResponse ? (
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
          <div>
            <h4 className="text-sm font-medium text-slate-200">1. Cadastrar técnico</h4>
            <p className="mt-1 text-xs text-slate-500">
              Use o mesmo username que existe no pfSense (ex.: <code>joao.silva</code>).
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Nome
              <input
                type="text"
                value={newFullName}
                onChange={(event) => setNewFullName(event.target.value)}
                placeholder="João Silva"
                className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Login pfSense
              <input
                type="text"
                value={newLoginUsername}
                onChange={(event) => setNewLoginUsername(event.target.value.toLowerCase())}
                placeholder="joao.silva"
                autoComplete="off"
                className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
              />
              <span className="text-xs text-slate-500">
                Não use <code className="text-slate-400">admin</code> — exclusivo do pfSense.
              </span>
            </label>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={createPending || !newFullName.trim() || !loginUsernameValid}
            onClick={() => {
              startCreateTransition(async () => {
                const result = await createTechnicianAction({
                  full_name: newFullName.trim(),
                  login_username: newLoginUsername.trim(),
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                const created = result.data;
                await reloadTechnicians();
                setTechnicianId(created.id);
                setNewFullName('');
                setNewLoginUsername('');
                setInfo(
                  `Técnico ${created.full_name} (${created.login_username}) cadastrado.`,
                );
                setError(null);
              });
            }}
          >
            Cadastrar técnico
          </Button>
        </div>
      ) : null}

      {initialResponse ? (
        <div className="space-y-3">
          <Alert variant={initialResponse.summary.enqueued > 0 ? 'success' : 'warning'}>
            {pendingRevokeMode === 'fleet' ? 'Revogação em toda a frota' : 'Lote criado'} para{' '}
            <strong className="text-slate-200">
              {initialResponse.technician.full_name}
            </strong>{' '}
            ({initialResponse.action === 'delete' ? 'remover' : 'desativar'}):{' '}
            {initialResponse.summary.enqueued} enfileirado(s),{' '}
            {initialResponse.summary.skipped} ignorado(s), {initialResponse.summary.failed}{' '}
            falha(s) imediata(s).
            {fleetSummary?.eligible != null ? (
              <> Elegíveis: {fleetSummary.eligible} de {fleetSummary.total_scanned}.</>
            ) : null}
            {batchIds.length > 1 ? <> Lotes: {batchIds.length}.</> : null}
          </Alert>

          {batchStatuses.length > 0 ? (
            <p className="text-sm text-slate-300">
              Progresso:{' '}
              {batchStatuses.reduce(
                (sum, batchStatus) => sum + (batchStatus.batch.succeeded_count ?? 0),
                0,
              )}{' '}
              concluído(s),{' '}
              {batchStatuses.reduce(
                (sum, batchStatus) => sum + (batchStatus.batch.failed_count ?? 0),
                0,
              )}{' '}
              falha(s),{' '}
              {batchStatuses.reduce(
                (sum, batchStatus) => sum + (batchStatus.batch.expired_count ?? 0),
                0,
              )}{' '}
              expirado(s) —{' '}
              <Badge variant={batchFinished ? 'neutral' : 'warning'}>
                {batchFinished ? 'finalizado' : 'em andamento'}
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setInitialResponse(null);
                setBatchStatuses([]);
                setShowConfirm(false);
                setConfirmText('');
                setInfo(null);
              }}
            >
              Fechar resultado
            </Button>
          ) : null}
        </div>
      ) : !showConfirm ? (
        <div className="space-y-3">
          {technicians.length === 0 ? (
            <Alert variant="info">
              Cadastre o técnico acima antes de revogar. O login deve ser idêntico ao username no
              pfSense.
            </Alert>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
                  Técnico
                  <select
                    value={technicianId}
                    onChange={(event) => setTechnicianId(event.target.value)}
                    className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
                  >
                    {technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.full_name} ({technician.login_username})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Ação
                  <select
                    value={action}
                    onChange={(event) =>
                      setAction(event.target.value as 'disable' | 'delete')
                    }
                    className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
                  >
                    <option value="disable">Desativar (reversível)</option>
                    <option value="delete">Remover (destrutivo)</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => openConfirm('fleet')}
                >
                  Revogar em toda a frota
                </Button>
                {nodeIds.length > 0 ? (
                  <Button type="button" variant="ghost" onClick={() => openConfirm(mode)}>
                    Revogar em {targetLabel}…
                  </Button>
                ) : null}
              </div>
              {usingSelection &&
              totalVisibleCount != null &&
              totalVisibleCount !== nodeIds.length ? (
                <p className="text-xs text-slate-500">
                  Seleção parcial: {nodeIds.length} de {totalVisibleCount} no filtro atual.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Confirma {action === 'delete' ? 'remoção' : 'desativação'} do técnico{' '}
            <strong className="text-fg">
              {selectedTechnician?.full_name ?? technicianId}
            </strong>
            {pendingRevokeMode === 'fleet' ? (
              <> em <strong className="text-fg">toda a frota</strong> acessível?</>
            ) : (
              <> em {nodeIds.length} firewall(s)?</>
            )}{' '}
            Digite <code className="text-slate-200">CONFIRMAR</code>.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="CONFIRMAR"
            className="h-11 w-full max-w-xs rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending || !confirmEnabled || !technicianId}
              onClick={() => {
                startTransition(async () => {
                  const labelBase =
                    action === 'delete'
                      ? `Offboarding — remover ${selectedTechnician?.login_username ?? ''}`
                      : `Offboarding — desativar ${selectedTechnician?.login_username ?? ''}`;

                  const result =
                    pendingRevokeMode === 'fleet'
                      ? await createTechnicianFleetRevokeAction({
                          technician_id: technicianId,
                          action,
                          confirm: 'CONFIRMAR',
                          client_id: clientId,
                          label: labelBase,
                        })
                      : await createTechnicianBatchRevokeAction({
                          technician_id: technicianId,
                          node_ids: nodeIds,
                          action,
                          confirm: 'CONFIRMAR',
                          client_id: clientId,
                          label: labelBase,
                        });

                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }

                  setInitialResponse(result.data);
                  setError(null);
                  setInfo(null);
                  setShowConfirm(false);
                  setConfirmText('');
                });
              }}
            >
              Confirmar revogação
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
