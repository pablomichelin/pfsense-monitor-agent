'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type {
  CommandBatchResponse,
  TechnicianBatchActionResponse,
  TechnicianBatchRevokeResponse,
  TechnicianFleetRevokeResponse,
  TechnicianListItem,
} from '@/lib/api';
import {
  createTechnicianAction,
  createTechnicianBatchPasswordResetAction,
  createTechnicianBatchProvisionAction,
  createTechnicianBatchRevokeAction,
  createTechnicianFleetRevokeAction,
  deleteTechnicianFromRegistryAction,
  listTechniciansAction,
  pollCommandBatchStatusAction,
} from '@/lib/technicians';
import { isValidManagedPfsenseUsername } from '@/lib/pfsense-username';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui';
import { CopyButton } from '@/components/copy-button';

const POLL_INTERVAL_MS = 12_000;
const MIN_AGENT_VERSION = '0.5.1';

type ActionMode = 'provision' | 'password_reset' | 'revoke';
type RevokeMode = 'filter' | 'selection' | 'fleet';

type Props = {
  nodeIds: string[];
  mode?: 'selection' | 'filter';
  totalVisibleCount?: number;
  clientId?: string;
  canManageTechnicians: boolean;
  canResetTechnicianPassword: boolean;
};

type BatchResponse =
  | TechnicianBatchActionResponse
  | TechnicianBatchRevokeResponse
  | TechnicianFleetRevokeResponse;

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
    case 'user already exists on firewall':
      return 'Usuário já existe no firewall';
    case 'would remove last active admin account':
      return 'Bloqueado — última conta admin';
    case 'reserved username':
      return 'Bloqueado — usuário reservado do pfSense (admin/root)';
    case 'no recent config backup found':
      return 'Bloqueado — sem backup recente do config.xml (rode um backup manual)';
    case 'technician accounts disabled on agent':
      return 'Gestão de técnicos desligada neste pfSense — atualize o package para 0.5.5+ (padrão ligado) ou marque a opção na GUI SystemUp Monitor';
    default:
      if (reason.startsWith('agent version below minimum')) {
        return `Agente incompatível (requer ${MIN_AGENT_VERSION}+)`;
      }
      if (reason.includes('technician accounts disabled on agent')) {
        return 'Gestão de técnicos desligada neste pfSense — atualize o package para 0.5.5+ (padrão ligado) ou marque a opção na GUI SystemUp Monitor';
      }
      return reason;
  }
}

function mapCommandDetail(detail: string | null | undefined, fallbackReason: string | null): string {
  const raw = detail?.trim() || fallbackReason;
  if (!raw) {
    return '—';
  }
  return mapSkipReason(raw);
}

function collectBatchIds(response: BatchResponse) {
  const fleetResponse = response as TechnicianFleetRevokeResponse;
  if (fleetResponse.batches?.length) {
    return fleetResponse.batches.map((batch) => batch.batch_id);
  }
  return response.batch?.batch_id ? [response.batch.batch_id] : [];
}

export function FleetTechnicianManagementPanel({
  nodeIds,
  mode = 'filter',
  totalVisibleCount,
  clientId,
  canManageTechnicians,
  canResetTechnicianPassword,
}: Props) {
  const [technicians, setTechnicians] = useState<TechnicianListItem[]>([]);
  const [search, setSearch] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [actionMode, setActionMode] = useState<ActionMode>('provision');
  const [revokeAction, setRevokeAction] = useState<'disable' | 'delete'>('delete');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingRevokeMode, setPendingRevokeMode] = useState<RevokeMode>('filter');
  const [confirmText, setConfirmText] = useState('');
  const [pending, startTransition] = useTransition();
  const [createPending, startCreateTransition] = useTransition();
  const [newFullName, setNewFullName] = useState('');
  const [newLoginUsername, setNewLoginUsername] = useState('');
  const [initialResponse, setInitialResponse] = useState<BatchResponse | null>(null);
  const [batchStatuses, setBatchStatuses] = useState<CommandBatchResponse[]>([]);
  const [lastPasswordDisplay, setLastPasswordDisplay] = useState<string | null>(null);
  const [passwordWasAutoGenerated, setPasswordWasAutoGenerated] = useState(false);
  const [lastActionLabel, setLastActionLabel] = useState('Provisionar');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePending, startDeleteTransition] = useTransition();

  const confirmEnabled = confirmText.trim().toUpperCase() === 'CONFIRMAR';
  const loginUsernameValid = isValidManagedPfsenseUsername(newLoginUsername);
  const deleteTarget = technicians.find((item) => item.id === deleteTargetId);
  const deleteConfirmEnabled =
    deleteTarget != null &&
    deleteConfirmText.trim().toLowerCase() === deleteTarget.login_username.toLowerCase();
  const PASSWORD_MIN = 10;
  const PASSWORD_MAX = 64;

  const resolveOptionalPassword = ():
    | { ok: true; password?: string }
    | { ok: false; error: string } => {
    const trimmed = password.trim();
    if (!trimmed) {
      return { ok: true };
    }
    if (trimmed.length < PASSWORD_MIN || trimmed.length > PASSWORD_MAX) {
      return {
        ok: false,
        error: `A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres, ou deixe o campo vazio para gerar automaticamente.`,
      };
    }
    return { ok: true, password: trimmed };
  };

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
    if (!canManageTechnicians && !canResetTechnicianPassword) {
      return;
    }

    void reloadTechnicians().catch(() => {
      setError('Falha ao carregar lista de técnicos');
    });
  }, [canManageTechnicians, canResetTechnicianPassword, reloadTechnicians]);

  const filteredTechnicians = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return technicians;
    }

    return technicians.filter(
      (technician) =>
        technician.full_name.toLowerCase().includes(query) ||
        technician.login_username.toLowerCase().includes(query),
    );
  }, [search, technicians]);

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

  if (!canManageTechnicians && !canResetTechnicianPassword) {
    return null;
  }

  const usingSelection = mode === 'selection' && nodeIds.length > 0;
  const targetLabel = usingSelection
    ? `${nodeIds.length} firewall(s) selecionado(s)`
    : nodeIds.length > 0
      ? `${nodeIds.length} firewall(s) visíveis neste filtro`
      : 'filtro atual';

  const selectedTechnician = technicians.find((item) => item.id === technicianId);

  const openRevokeConfirm = (revokeMode: RevokeMode) => {
    setPendingRevokeMode(revokeMode);
    setShowConfirm(true);
    setConfirmText('');
    setError(null);
  };

  const runBatchAction = () => {
    if (!technicianId || nodeIds.length === 0) {
      return;
    }

    const passwordCheck = resolveOptionalPassword();
    if (!passwordCheck.ok) {
      setError(passwordCheck.error);
      return;
    }

    startTransition(async () => {
      const autoGenerated = !passwordCheck.password;
      let result;

      if (actionMode === 'provision') {
        setLastActionLabel('Provisionar');
        result = await createTechnicianBatchProvisionAction({
          technician_id: technicianId,
          node_ids: nodeIds,
          ...(passwordCheck.password ? { password: passwordCheck.password } : {}),
          client_id: clientId,
          label: `Provisionar ${selectedTechnician?.login_username ?? ''}`,
          confirm: 'CONFIRMAR',
        });
      } else if (actionMode === 'password_reset') {
        setLastActionLabel('Resetar senha');
        result = await createTechnicianBatchPasswordResetAction({
          technician_id: technicianId,
          node_ids: nodeIds,
          ...(passwordCheck.password ? { password: passwordCheck.password } : {}),
          client_id: clientId,
          label: `Reset senha ${selectedTechnician?.login_username ?? ''}`,
          confirm: 'CONFIRMAR',
        });
      } else {
        return;
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const response: BatchResponse = result.data;
      setInitialResponse(response);
      setPasswordWasAutoGenerated(autoGenerated);
      setLastPasswordDisplay(
        'password_display_once' in response ? response.password_display_once ?? null : null,
      );
      setError(null);
      setInfo(null);
      setPassword('');
      setShowConfirm(false);
      setConfirmText('');
    });
  };

  const fleetSummary =
    initialResponse && 'summary' in initialResponse
      ? (initialResponse.summary as TechnicianFleetRevokeResponse['summary'])
      : null;

  const actionModeLabels: Record<ActionMode, string> = {
    provision: 'Provisionar',
    password_reset: 'Resetar senha',
    revoke: 'Excluir',
  };

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="font-display text-base text-white">Gestão de técnicos pfSense</h3>
        <p className="mt-1 text-sm text-slate-400">
          Cadastro centralizado e ações em lote. Em /nodes, marque os firewalls na tabela (mesma seleção
          do package). Técnicos novos (package 0.5.6+) têm acesso amplo, sem User Manager — só alteram a
          própria senha. Requer agente {MIN_AGENT_VERSION}+.
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {info ? <Alert variant="success">{info}</Alert> : null}

      {!initialResponse ? (
        <>
          <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h4 className="text-sm font-medium text-slate-200">Cadastro de técnicos</h4>
                <p className="mt-1 text-xs text-slate-500">
                  O login pfSense deve ser único por técnico (ex.: <code>joao.silva</code>).
                </p>
              </div>
              <label className="flex w-full max-w-xs flex-col gap-1 text-sm text-slate-300">
                Buscar
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome ou login…"
                  className="h-10 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
                />
              </label>
            </div>

            {filteredTechnicians.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Nome</th>
                      <th className="px-3 py-2">Login pfSense</th>
                      <th className="px-3 py-2">Contas</th>
                      {canManageTechnicians ? <th className="px-3 py-2">Ações</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTechnicians.map((technician) => (
                      <tr
                        key={technician.id}
                        className={`border-b border-slate-900/80 text-slate-200 ${
                          technician.id === technicianId ? 'bg-slate-900/50' : ''
                        }`}
                      >
                        <td className="px-3 py-2">{technician.full_name}</td>
                        <td className="px-3 py-2 font-mono text-xs">{technician.login_username}</td>
                        <td className="px-3 py-2">{technician.node_account_count}</td>
                        {canManageTechnicians ? (
                          <td className="px-3 py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-rose-300 hover:text-rose-200"
                              onClick={() => {
                                setDeleteTargetId(technician.id);
                                setDeleteConfirmText('');
                                setError(null);
                              }}
                            >
                              Excluir do cadastro
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Alert variant="info">Nenhum técnico cadastrado ainda.</Alert>
            )}

            {deleteTarget && canManageTechnicians ? (
              <div className="space-y-3 rounded-lg border border-rose-900/60 bg-rose-950/20 p-4">
                <p className="text-sm text-slate-200">
                  Excluir <strong className="text-white">{deleteTarget.full_name}</strong> (
                  <code className="text-slate-200">{deleteTarget.login_username}</code>) do cadastro
                  central? O técnico some da matriz e das listas. Isso{' '}
                  <strong className="text-white">não</strong> remove o usuário dos firewalls —
                  use a aba Excluir para remover o usuário nos pfSense.
                </p>
                <p className="text-xs text-slate-400">
                  Digite o login pfSense <code>{deleteTarget.login_username}</code> para confirmar.
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder={deleteTarget.login_username}
                  className="h-11 w-full max-w-xs rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
                  autoComplete="off"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={deletePending || !deleteConfirmEnabled}
                    onClick={() => {
                      startDeleteTransition(async () => {
                        const result = await deleteTechnicianFromRegistryAction({
                          technician_id: deleteTarget.id,
                          confirm_login_username: deleteConfirmText.trim(),
                        });
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        await reloadTechnicians();
                        if (technicianId === deleteTarget.id) {
                          setTechnicianId('');
                        }
                        setDeleteTargetId(null);
                        setDeleteConfirmText('');
                        setInfo(
                          `Técnico ${deleteTarget.full_name} excluído do cadastro central.`,
                        );
                        setError(null);
                      });
                    }}
                  >
                    Confirmar remoção
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={deletePending}
                    onClick={() => {
                      setDeleteTargetId(null);
                      setDeleteConfirmText('');
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}

            {canManageTechnicians ? (
              <div className="grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Nome completo
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
                    Não use <code className="text-slate-400">admin</code> — conta exclusiva do
                    pfSense, nunca gerenciada pelo sistema.
                  </span>
                </label>
                <div className="sm:col-span-2">
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
              </div>
            ) : null}
          </div>

          {technicians.length > 0 && mode === 'selection' && nodeIds.length === 0 ? (
            <Alert variant="info">
              Marque um ou mais firewalls na tabela <strong className="text-slate-200">Inventário</strong>{' '}
              acima (checkboxes) para provisionar, resetar senha ou excluir só nesses. É a mesma seleção
              usada no upgrade de package.
            </Alert>
          ) : null}

          {technicians.length > 0 && (nodeIds.length > 0 || mode === 'filter') ? (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
              <div className="flex flex-wrap gap-2">
                {canManageTechnicians ? (
                  <Button
                    type="button"
                    variant={actionMode === 'provision' ? 'primary' : 'ghost'}
                    onClick={() => {
                      setActionMode('provision');
                      setShowConfirm(false);
                    }}
                  >
                    Provisionar
                  </Button>
                ) : null}
                {canResetTechnicianPassword ? (
                  <Button
                    type="button"
                    variant={actionMode === 'password_reset' ? 'primary' : 'ghost'}
                    onClick={() => {
                      setActionMode('password_reset');
                      setShowConfirm(false);
                    }}
                  >
                    Resetar senha
                  </Button>
                ) : null}
                {canManageTechnicians ? (
                  <Button
                    type="button"
                    variant={actionMode === 'revoke' ? 'primary' : 'ghost'}
                    onClick={() => {
                      setActionMode('revoke');
                      setRevokeAction('delete');
                      setShowConfirm(false);
                    }}
                  >
                    Excluir
                  </Button>
                ) : null}
              </div>

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

                {actionMode !== 'revoke' ? (
                  <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
                    Senha (opcional — gera automaticamente se vazio)
                    <input
                      type="password"
                      name="technician-batch-secret"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Mín. 10 caracteres ou deixe vazio"
                      className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                    />
                  </label>
                ) : (
                  <label className="flex flex-col gap-1 text-sm text-slate-300">
                    Modo
                    <select
                      value={revokeAction}
                      onChange={(event) =>
                        setRevokeAction(event.target.value as 'disable' | 'delete')
                      }
                      className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
                    >
                      <option value="delete">Excluir usuário do firewall</option>
                      <option value="disable">Apenas desativar (reversível)</option>
                    </select>
                  </label>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Alvo: {targetLabel}
                {usingSelection &&
                totalVisibleCount != null &&
                totalVisibleCount !== nodeIds.length
                  ? ` (${nodeIds.length} de ${totalVisibleCount} no filtro)`
                  : null}
              </p>

              {actionMode === 'revoke' && !showConfirm ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => openRevokeConfirm(mode)}>
                    {revokeAction === 'delete' ? 'Excluir' : 'Desativar'} em {targetLabel}…
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => openRevokeConfirm('fleet')}>
                    {revokeAction === 'delete' ? 'Excluir' : 'Desativar'} em toda a frota…
                  </Button>
                </div>
              ) : actionMode === 'revoke' && showConfirm ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">
                    Confirma {revokeAction === 'delete' ? 'exclusão permanente' : 'desativação'} do
                    técnico{' '}
                    <strong className="text-white">
                      {selectedTechnician?.full_name ?? technicianId}
                    </strong>
                    {pendingRevokeMode === 'fleet' ? (
                      <> em <strong className="text-white">toda a frota</strong>?</>
                    ) : (
                      <> em {nodeIds.length} firewall(s)?</>
                    )}{' '}
                    {revokeAction === 'delete'
                      ? 'O usuário será removido do pfSense (não dá para desfazer por aqui).'
                      : 'A conta permanece no firewall, só fica desabilitada.'}{' '}
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
                            revokeAction === 'delete'
                              ? `Offboarding — remover ${selectedTechnician?.login_username ?? ''}`
                              : `Offboarding — desativar ${selectedTechnician?.login_username ?? ''}`;

                          const result =
                            pendingRevokeMode === 'fleet'
                              ? await createTechnicianFleetRevokeAction({
                                  technician_id: technicianId,
                                  action: revokeAction,
                                  confirm: 'CONFIRMAR',
                                  client_id: clientId,
                                  label: labelBase,
                                })
                              : await createTechnicianBatchRevokeAction({
                                  technician_id: technicianId,
                                  node_ids: nodeIds,
                                  action: revokeAction,
                                  confirm: 'CONFIRMAR',
                                  client_id: clientId,
                                  label: labelBase,
                                });

                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }

                          setInitialResponse(result.data);
                          setLastActionLabel(revokeAction === 'delete' ? 'Excluir' : 'Desativar');
                          setLastPasswordDisplay(null);
                          setPasswordWasAutoGenerated(false);
                          setError(null);
                          setInfo(null);
                          setShowConfirm(false);
                          setConfirmText('');
                        });
                      }}
                    >
                      Confirmar {revokeAction === 'delete' ? 'exclusão' : 'desativação'}
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
              ) : actionMode !== 'revoke' && !showConfirm ? (
                <Button
                  type="button"
                  disabled={pending || !technicianId}
                  onClick={() => {
                    const passwordCheck = resolveOptionalPassword();
                    if (!passwordCheck.ok) {
                      setError(passwordCheck.error);
                      return;
                    }
                    setShowConfirm(true);
                    setConfirmText('');
                    setError(null);
                  }}
                >
                  {actionModeLabels[actionMode]} em {nodeIds.length} firewall(s)
                </Button>
              ) : actionMode !== 'revoke' && showConfirm ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">
                    Confirma {actionMode === 'provision' ? 'provisionar' : 'resetar a senha de'}{' '}
                    <strong className="text-white">
                      {selectedTechnician?.full_name ?? technicianId}
                    </strong>{' '}
                    em {nodeIds.length} firewall(s)?{' '}
                    {actionMode === 'provision'
                      ? 'Isso cria um usuário administrador nesses firewalls imediatamente.'
                      : 'A senha atual desse técnico deixará de funcionar nesses firewalls imediatamente.'}{' '}
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
                      onClick={runBatchAction}
                    >
                      Confirmar {actionModeLabels[actionMode].toLowerCase()}
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
              ) : null}
            </div>
          ) : technicians.length > 0 && mode === 'selection' && nodeIds.length === 0 && canManageTechnicians ? (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
              <p className="text-sm text-slate-400">
                Sem seleção na tabela: só é possível excluir/desativar o técnico em{' '}
                <strong className="text-slate-200">toda a frota</strong>. Para provisionar ou resetar
                senha, marque firewalls no inventário.
              </p>
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
                  Modo
                  <select
                    value={revokeAction}
                    onChange={(event) =>
                      setRevokeAction(event.target.value as 'disable' | 'delete')
                    }
                    className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
                  >
                    <option value="delete">Excluir usuário do firewall</option>
                    <option value="disable">Apenas desativar (reversível)</option>
                  </select>
                </label>
              </div>
              {!showConfirm ? (
                <Button type="button" variant="secondary" onClick={() => openRevokeConfirm('fleet')}>
                  {revokeAction === 'delete' ? 'Excluir' : 'Desativar'} em toda a frota…
                </Button>
              ) : pendingRevokeMode === 'fleet' ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">
                    Confirma {revokeAction === 'delete' ? 'exclusão permanente' : 'desativação'} do
                    técnico{' '}
                    <strong className="text-white">
                      {selectedTechnician?.full_name ?? technicianId}
                    </strong>{' '}
                    em <strong className="text-white">toda a frota</strong>? Digite{' '}
                    <code className="text-slate-200">CONFIRMAR</code>.
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
                            revokeAction === 'delete'
                              ? `Offboarding — remover ${selectedTechnician?.login_username ?? ''}`
                              : `Offboarding — desativar ${selectedTechnician?.login_username ?? ''}`;
                          const result = await createTechnicianFleetRevokeAction({
                            technician_id: technicianId,
                            action: revokeAction,
                            confirm: 'CONFIRMAR',
                            client_id: clientId,
                            label: labelBase,
                          });
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setInitialResponse(result.data);
                          setLastActionLabel(revokeAction === 'delete' ? 'Excluir' : 'Desativar');
                          setLastPasswordDisplay(null);
                          setPasswordWasAutoGenerated(false);
                          setError(null);
                          setInfo(null);
                          setShowConfirm(false);
                          setConfirmText('');
                        });
                      }}
                    >
                      Confirmar {revokeAction === 'delete' ? 'exclusão' : 'desativação'}
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
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-3">
          {lastPasswordDisplay ? (
            <div className="space-y-3 rounded-lg border-2 border-amber-500/70 bg-amber-950/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-amber-100">
                    {passwordWasAutoGenerated
                      ? 'Senha gerada automaticamente'
                      : 'Senha aplicada neste lote'}
                  </p>
                  <p className="mt-1 text-xs text-amber-200/80">
                    Copie agora — esta senha não será exibida novamente após fechar o resultado.
                  </p>
                </div>
                <CopyButton value={lastPasswordDisplay} label="Copiar senha" />
              </div>
              <code className="block select-all break-all rounded-lg border border-amber-700/50 bg-slate-950/60 px-3 py-2 font-mono text-base text-amber-50">
                {lastPasswordDisplay}
              </code>
            </div>
          ) : null}

          <Alert variant={initialResponse.summary.enqueued > 0 ? 'success' : 'warning'}>
            Lote de <strong className="text-slate-200">{lastActionLabel}</strong> para{' '}
            <strong className="text-slate-200">{initialResponse.technician.full_name}</strong>:{' '}
            {initialResponse.summary.enqueued} enfileirado(s), {initialResponse.summary.skipped}{' '}
            ignorado(s), {initialResponse.summary.failed} falha(s) imediata(s).
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
                        {mapCommandDetail(live?.error_message, item.reason)}
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
                setLastPasswordDisplay(null);
                setPasswordWasAutoGenerated(false);
                setInfo(null);
              }}
            >
              Fechar resultado
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
