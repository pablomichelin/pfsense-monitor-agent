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
  pollBackupCommandStatusAction,
  pollNodeTechnicianAccountsAction,
} from '@/lib/technicians';
import { isValidManagedPfsenseUsername } from '@/lib/pfsense-username';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui';
import { CopyButton } from '@/components/copy-button';

const POLL_INTERVAL_MS = 12_000;
const MIN_AGENT_VERSION = '0.5.4';

type ActionMode = 'provision' | 'password_reset' | 'revoke';
type RevokeMode = 'filter' | 'selection' | 'fleet';
type PanelTab = 'technicians' | 'batch_action';

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

function mapAccountStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Concluído';
    case 'pending_create':
    case 'password_reset_pending':
      return 'Provisionando';
    case 'failed':
      return 'Falhou';
    case 'disabled':
      return 'Desativado';
    case 'removed':
      return 'Removido';
    default:
      return status;
  }
}

function mapOutcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'enqueued':
      return 'Enfileirado';
    case 'backup_queued':
      return 'Backup enfileirado';
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
      return 'Snapshot de usuários indisponível (agente 0.5.4+)';
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
    case 'backup queued before provision':
      return 'Backup enfileirado — provisionamento após conclusão';
    case 'command expired':
      return 'Comando expirado — o agente não respondeu a tempo';
    case 'command expired before backup follow-up':
      return 'Backup expirou antes do provisionamento automático';
    case 'password hash missing after apply':
    case 'password hash verification failed':
    case 'invalid user structure (nested item key)':
      return 'Falha ao aplicar senha no pfSense — atualize o package do agente para 0.5.11+ (corrigido no 2.7.x)';
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
  const [backupPipelineByNodeId, setBackupPipelineByNodeId] = useState<
    Map<
      string,
      {
        backupStatus: string;
        accountStatus?: string;
      }
    >
  >(new Map());
  const [lastPasswordDisplay, setLastPasswordDisplay] = useState<string | null>(null);
  const [passwordWasAutoGenerated, setPasswordWasAutoGenerated] = useState(false);
  const [lastActionLabel, setLastActionLabel] = useState('Provisionar');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePending, startDeleteTransition] = useTransition();
  const [backupBeforeProvision, setBackupBeforeProvision] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>(
    nodeIds.length > 0 ? 'batch_action' : 'technicians',
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [autoGeneratePassword, setAutoGeneratePassword] = useState(false);

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
    if (autoGeneratePassword) {
      return { ok: true };
    }
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

  useEffect(() => {
    if (nodeIds.length > 0) {
      setPanelTab('batch_action');
    }
  }, [nodeIds.length]);

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

  const backupQueuedItems = useMemo(() => {
    if (!initialResponse || !('results' in initialResponse)) {
      return [];
    }

    return initialResponse.results.filter(
      (item) => item.outcome === 'backup_queued' && item.command_id,
    );
  }, [initialResponse]);

  const refreshBackupPipeline = useCallback(async () => {
    if (backupQueuedItems.length === 0 || !technicianId) {
      return;
    }

    try {
      const entries = await Promise.all(
        backupQueuedItems.map(async (item) => {
          const commandId = item.command_id;
          if (!commandId) {
            return null;
          }

          const backupStatus = await pollBackupCommandStatusAction(item.node_id, commandId);
          let accountStatus: string | undefined;

          if (backupStatus.status === 'succeeded') {
            const accounts = await pollNodeTechnicianAccountsAction(item.node_id);
            const account = accounts.items.find(
              (entry) => entry.technician_id === technicianId,
            );
            accountStatus = account?.status;
          }

          return [
            item.node_id,
            {
              backupStatus: backupStatus.status,
              accountStatus,
            },
          ] as const;
        }),
      );

      const next = new Map<string, { backupStatus: string; accountStatus?: string }>();
      for (const entry of entries) {
        if (entry) {
          next.set(entry[0], entry[1]);
        }
      }
      setBackupPipelineByNodeId(next);
    } catch {
      // polling silencioso
    }
  }, [backupQueuedItems, technicianId]);

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
    if (batchIds.length === 0 && backupQueuedItems.length === 0) {
      return;
    }

    void refreshBatchStatuses();
    void refreshBackupPipeline();

    const timer = window.setInterval(() => {
      void refreshBatchStatuses();
      void refreshBackupPipeline();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [batchIds, backupQueuedItems.length, refreshBatchStatuses, refreshBackupPipeline]);

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
    (batchStatuses.length === 0 ||
      batchStatuses.every(
        (batchStatus) =>
          batchStatus.batch.status === 'completed' ||
          batchStatus.batch.status === 'failed' ||
          batchStatus.batch.status === 'cancelled',
      )) &&
    (backupQueuedItems.length === 0 ||
      backupQueuedItems.every((item) => {
        const pipeline = backupPipelineByNodeId.get(item.node_id);
        if (!pipeline) {
          return false;
        }
        if (pipeline.accountStatus === 'active') {
          return true;
        }
        if (pipeline.accountStatus === 'failed') {
          return true;
        }
        return (
          pipeline.backupStatus === 'failed' ||
          pipeline.backupStatus === 'expired' ||
          pipeline.backupStatus === 'cancelled'
        );
      }));

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

  const canShowBatchAction =
    technicians.length > 0 &&
    (nodeIds.length > 0 ||
      mode === 'filter' ||
      (mode === 'selection' && nodeIds.length === 0 && canManageTechnicians));

  const selectTechnician = (id: string, openBatchTab = false) => {
    setTechnicianId(id);
    if (openBatchTab && nodeIds.length > 0) {
      setPanelTab('batch_action');
    }
  };

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
          backup_before_provision: backupBeforeProvision,
          client_id: clientId,
          label: `Provisionar ${selectedTechnician?.login_username ?? ''}`,
          confirm: 'CONFIRMAR',
        });
      } else if (actionMode === 'password_reset') {
        setLastActionLabel('Alterar senha');
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
    password_reset: 'Alterar senha',
    revoke: 'Remover dos firewalls',
  };

  const inputClassName =
    'h-11 w-full rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200';

  const renderRevokeConfirmBlock = (fleetOnly: boolean) => (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        Confirma {revokeAction === 'delete' ? 'remoção permanente' : 'desativação'} do técnico{' '}
        <strong className="text-fg">{selectedTechnician?.full_name ?? technicianId}</strong>
        {fleetOnly || pendingRevokeMode === 'fleet' ? (
          <> em <strong className="text-fg">toda a frota</strong>?</>
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
                fleetOnly || pendingRevokeMode === 'fleet'
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
              setLastActionLabel(
                revokeAction === 'delete' ? 'Remover dos firewalls' : 'Desativar nos firewalls',
              );
              setLastPasswordDisplay(null);
              setPasswordWasAutoGenerated(false);
              setError(null);
              setInfo(null);
              setShowConfirm(false);
              setConfirmText('');
            });
          }}
        >
          Confirmar {revokeAction === 'delete' ? 'remoção' : 'desativação'}
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
  );

  const renderTechnicianPicker = (layout: 'stacked' | 'inline' = 'stacked') => (
    <>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-slate-300 lg:min-w-[14rem]">
        Técnico para esta ação
        <select
          value={technicianId}
          onChange={(event) => setTechnicianId(event.target.value)}
          className={inputClassName}
        >
          {technicians.length === 0 ? (
            <option value="">Nenhum técnico cadastrado</option>
          ) : (
            technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.full_name} ({technician.login_username}) —{' '}
                {technician.node_account_count} conta(s)
              </option>
            ))
          )}
        </select>
      </label>
      {canManageTechnicians ? (
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 self-end"
          onClick={() => {
            setShowCreateModal(true);
            setNewFullName('');
            setNewLoginUsername('');
            setError(null);
          }}
        >
          + Novo técnico
        </Button>
      ) : null}
      {layout === 'stacked' ? (
        <p className="w-full text-xs text-slate-500 lg:col-span-full">
          Troque no menu acima ou na aba <strong className="text-slate-400">Técnicos</strong> (clique na
          linha da tabela).
        </p>
      ) : null}
    </>
  );

  const renderBatchActionContent = (fleetOnly: boolean) => (
    <div className="space-y-4">
      {!fleetOnly ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm">
          <span className="text-slate-400">Alvo:</span>
          <Badge variant="neutral">{targetLabel}</Badge>
          {usingSelection && totalVisibleCount != null && totalVisibleCount !== nodeIds.length ? (
            <span className="text-xs text-slate-500">
              ({nodeIds.length} de {totalVisibleCount} no filtro)
            </span>
          ) : null}
        </div>
      ) : (
        <Alert variant="info">
          Sem firewalls selecionados no inventário — só é possível{' '}
          <strong className="text-slate-200">remover ou desativar</strong> o técnico em{' '}
          <strong className="text-slate-200">toda a frota</strong>. Para provisionar ou alterar senha,
          marque firewalls na tabela acima.
        </Alert>
      )}

      {!fleetOnly ? (
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
              Alterar senha
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
              Remover dos firewalls
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4">
        {!technicianId ? (
          <Alert variant="warning">Escolha um técnico ou cadastre um novo antes de continuar.</Alert>
        ) : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          {renderTechnicianPicker('inline')}

          {actionMode === 'revoke' || fleetOnly ? (
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm text-slate-300 lg:max-w-xs">
              Modo de remoção
              <select
                value={revokeAction}
                onChange={(event) => setRevokeAction(event.target.value as 'disable' | 'delete')}
                className={inputClassName}
              >
                <option value="delete">Remover usuário do firewall</option>
                <option value="disable">Apenas desativar (reversível)</option>
              </select>
            </label>
          ) : (
            <>
              <label className="flex h-11 shrink-0 items-center gap-2 self-end text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={autoGeneratePassword}
                  onChange={(event) => {
                    setAutoGeneratePassword(event.target.checked);
                    if (event.target.checked) {
                      setPassword('');
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-600"
                />
                Senha automática
              </label>

              {!autoGeneratePassword ? (
                <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm text-slate-300 lg:max-w-sm">
                  Senha do lote
                  <input
                    type="password"
                    name="technician-batch-secret"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={`Mín. ${PASSWORD_MIN} caracteres`}
                    className={inputClassName}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                  />
                </label>
              ) : null}

              {actionMode === 'provision' ? (
                <label className="flex h-11 shrink-0 items-center gap-2 self-end text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={backupBeforeProvision}
                    onChange={(event) => setBackupBeforeProvision(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-600"
                  />
                  Backup automático se necessário
                </label>
              ) : null}
            </>
          )}

          {actionMode === 'revoke' || fleetOnly ? (
            !showConfirm ? (
              <div className="flex flex-wrap gap-2 self-end lg:ml-auto">
                {!fleetOnly ? (
                  <Button type="button" variant="secondary" onClick={() => openRevokeConfirm(mode)}>
                    {revokeAction === 'delete' ? 'Remover' : 'Desativar'} em {targetLabel}…
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={fleetOnly ? 'secondary' : 'ghost'}
                  onClick={() => openRevokeConfirm('fleet')}
                >
                  {revokeAction === 'delete' ? 'Remover' : 'Desativar'} em toda a frota…
                </Button>
              </div>
            ) : null
          ) : !showConfirm ? (
            <Button
              type="button"
              className="shrink-0 self-end lg:ml-auto"
              disabled={pending || !technicianId || nodeIds.length === 0}
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
          ) : null}
        </div>

        {actionMode === 'provision' && !fleetOnly ? (
          <p className="text-xs text-slate-500">
            Se o usuário já existir no firewall, a senha será atualizada. Firewalls sem backup recente
            entram em fila automática (se marcado). Requer agente {MIN_AGENT_VERSION}+.
          </p>
        ) : actionMode === 'password_reset' && !fleetOnly ? (
          <p className="text-xs text-slate-500">
            A senha informada substituirá a atual em todos os firewalls do lote. Requer agente{' '}
            {MIN_AGENT_VERSION}+.
          </p>
        ) : null}

        {actionMode === 'revoke' || fleetOnly ? (
          showConfirm ? renderRevokeConfirmBlock(fleetOnly) : null
        ) : showConfirm ? (
          <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/20 p-4">
            <p className="text-sm text-slate-300">
              Confirma {actionMode === 'provision' ? 'provisionar' : 'alterar a senha de'}{' '}
              <strong className="text-fg">{selectedTechnician?.full_name ?? technicianId}</strong>{' '}
              em {nodeIds.length} firewall(s)? Digite{' '}
              <code className="text-slate-200">CONFIRMAR</code>.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="font-display text-base text-fg">Gestão de técnicos pfSense</h3>
        <p className="mt-1 text-sm text-slate-400">
          Cadastro central e ações em lote na seleção do inventário (mesma seleção do upgrade de
          package).
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {info ? <Alert variant="success">{info}</Alert> : null}

      {!initialResponse ? (
        <>
          <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
            <Button
              type="button"
              variant={panelTab === 'technicians' ? 'primary' : 'ghost'}
              onClick={() => setPanelTab('technicians')}
            >
              Técnicos
            </Button>
            {canShowBatchAction ? (
              <Button
                type="button"
                variant={panelTab === 'batch_action' ? 'primary' : 'ghost'}
                onClick={() => setPanelTab('batch_action')}
              >
                Ação em lote
                {nodeIds.length > 0 ? (
                  <span className="ml-1.5 text-xs opacity-80">({nodeIds.length})</span>
                ) : null}
              </Button>
            ) : null}
            {canManageTechnicians && panelTab === 'batch_action' ? (
              <Button
                type="button"
                variant="secondary"
                className="ml-auto"
                onClick={() => {
                  setShowCreateModal(true);
                  setNewFullName('');
                  setNewLoginUsername('');
                  setError(null);
                }}
              >
                + Novo técnico
              </Button>
            ) : null}
          </div>

          {panelTab === 'technicians' ? (
            <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h4 className="text-sm font-medium text-slate-200">Cadastro central</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Clique na linha para selecionar o técnico usado na ação em lote.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
                  <label className="flex w-full min-w-[12rem] flex-col gap-1 text-sm text-slate-300">
                    Buscar
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Nome ou login…"
                      className="h-10 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
                    />
                  </label>
                  {canManageTechnicians ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowCreateModal(true);
                        setNewFullName('');
                        setNewLoginUsername('');
                        setError(null);
                      }}
                    >
                      + Novo técnico
                    </Button>
                  ) : null}
                </div>
              </div>

              {filteredTechnicians.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Nome</th>
                        <th className="px-3 py-2">Login pfSense</th>
                        <th className="px-3 py-2">Contas</th>
                        {canManageTechnicians ? <th className="px-3 py-2">Cadastro</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTechnicians.map((technician) => {
                        const isSelected = technician.id === technicianId;
                        return (
                          <tr
                            key={technician.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectTechnician(technician.id, true)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                selectTechnician(technician.id, true);
                              }
                            }}
                            className={`cursor-pointer border-b border-slate-900/80 text-slate-200 transition-colors hover:bg-slate-900/40 ${
                              isSelected ? 'bg-cyan-950/30 ring-1 ring-inset ring-cyan-800/50' : ''
                            }`}
                          >
                            <td className="px-3 py-2">
                              {technician.full_name}
                              {isSelected ? (
                                <Badge variant="neutral" className="ml-2 text-[10px]">
                                  selecionado
                                </Badge>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {technician.login_username}
                            </td>
                            <td className="px-3 py-2">{technician.node_account_count}</td>
                            {canManageTechnicians ? (
                              <td className="px-3 py-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="text-rose-300 hover:text-rose-200"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setDeleteTargetId(technician.id);
                                    setDeleteConfirmText('');
                                    setError(null);
                                  }}
                                >
                                  Remover do cadastro
                                </Button>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Alert variant="info">Nenhum técnico cadastrado ainda.</Alert>
              )}

              {deleteTarget && canManageTechnicians ? (
                <div className="space-y-3 rounded-lg border border-rose-900/60 bg-rose-950/20 p-4">
                  <p className="text-sm text-slate-200">
                    Remover <strong className="text-fg">{deleteTarget.full_name}</strong> (
                    <code className="text-slate-200">{deleteTarget.login_username}</code>) do{' '}
                    <strong className="text-fg">cadastro central</strong>? O técnico some da matriz
                    e das listas. Isso <strong className="text-fg">não</strong> remove o usuário dos
                    firewalls — use a aba <strong className="text-fg">Ação em lote → Remover dos firewalls</strong>.
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
                            `Técnico ${deleteTarget.full_name} removido do cadastro central.`,
                          );
                          setError(null);
                        });
                      }}
                    >
                      Confirmar remoção do cadastro
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

              {technicians.length > 0 && nodeIds.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
                  <Button type="button" onClick={() => setPanelTab('batch_action')}>
                    Ir para ação em lote ({nodeIds.length} firewall(s))
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {panelTab === 'batch_action' && canShowBatchAction ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/20 p-4">
              {nodeIds.length > 0 || mode === 'filter'
                ? renderBatchActionContent(false)
                : renderBatchActionContent(true)}
            </div>
          ) : null}

          {showCreateModal && canManageTechnicians ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center theme-overlay p-4"
              role="presentation"
              onClick={() => setShowCreateModal(false)}
            >
              <div
                className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-panel p-5 shadow-xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-technician-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div>
                  <h4 id="create-technician-title" className="text-base font-medium text-fg">
                    Novo técnico
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Login único no pfSense (ex.: <code>joao.silva</code>). Não use{' '}
                    <code>admin</code>.
                  </p>
                </div>
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  Nome completo
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(event) => setNewFullName(event.target.value)}
                    placeholder="João Silva"
                    className={inputClassName}
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
                    className={inputClassName}
                  />
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
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
                        setShowCreateModal(false);
                        setNewFullName('');
                        setNewLoginUsername('');
                        setInfo(
                          `Técnico ${created.full_name} (${created.login_username}) cadastrado.`,
                        );
                        setError(null);
                        if (nodeIds.length > 0) {
                          setPanelTab('batch_action');
                        }
                      });
                    }}
                  >
                    Cadastrar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={createPending}
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
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
            {initialResponse.summary.enqueued} enfileirado(s)
            {'backup_queued' in initialResponse.summary &&
            typeof initialResponse.summary.backup_queued === 'number' &&
            initialResponse.summary.backup_queued > 0
              ? `, ${initialResponse.summary.backup_queued} backup(s) enfileirado(s) antes do provisionamento`
              : ''}
            , {initialResponse.summary.skipped} ignorado(s), {initialResponse.summary.failed}{' '}
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
                  const pipeline = backupPipelineByNodeId.get(item.node_id);
                  const label = item.hostname ?? item.node_id.slice(0, 8);

                  let commandStatusLabel = '—';
                  if (item.outcome === 'backup_queued' && pipeline) {
                    if (pipeline.accountStatus) {
                      commandStatusLabel = mapAccountStatusLabel(pipeline.accountStatus);
                    } else if (pipeline.backupStatus === 'succeeded') {
                      commandStatusLabel = 'Backup concluído — provisionando';
                    } else {
                      commandStatusLabel = `${mapCommandStatusLabel(pipeline.backupStatus)} (backup)`;
                    }
                  } else if (live) {
                    commandStatusLabel = mapCommandStatusLabel(live.status);
                  }

                  return (
                    <tr key={item.node_id} className="border-b border-slate-900/80 text-slate-200">
                      <td className="px-3 py-2">{label}</td>
                      <td className="px-3 py-2">{mapOutcomeLabel(item.outcome)}</td>
                      <td className="px-3 py-2">{commandStatusLabel}</td>
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
                setBackupPipelineByNodeId(new Map());
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
