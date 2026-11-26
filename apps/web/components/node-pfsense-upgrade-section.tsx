'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  PfsenseUpdateBranchTarget,
  PfsenseUpgradeStatusResponse,
} from '@/lib/api';
import {
  pollPfsenseUpgradeStatusAction,
  requestPfsenseRepoRepairAction,
  requestPfsenseSetBranchAction,
  requestPfsenseUpdateRefreshCheckAction,
  requestPfsenseUpgradeAction,
} from '@/lib/pfsense-upgrade';
import { formatDateTime } from '@/lib/format';
import { useScopedRead } from '@/lib/use-scoped-read';
import { useUpgradeReceipt } from '@/lib/use-upgrade-receipt';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const ACTIVE_STATUSES = new Set(['pending', 'picked_up', 'running']);
const POLL_INTERVAL_MS = 12_000;
const REFRESH_POLL_INTERVAL_MS = 8_000;

const firmwareCheckSettings = {
  refresh: {
    requestedKey: 'force_check_requested_at',
    pendingKey: 'force_check_pending',
    timeoutMessage: 'Ainda aguardando o agente. O próximo heartbeat deve concluir a checagem.',
  },
  repair: {
    requestedKey: 'repair_requested_at',
    pendingKey: 'repair_pending',
    timeoutMessage: 'Ainda aguardando o agente concluir o reparo. O próximo heartbeat deve atualizar o status.',
  },
  branch: {
    requestedKey: 'set_branch_requested_at',
    pendingKey: 'set_branch_pending',
    timeoutMessage: 'Ainda aguardando o agente apontar o branch. O próximo heartbeat deve atualizar o status.',
  },
} as const;

type FirmwareCheck = { requestedAt: string; deadline: number } & (
  | { kind: 'refresh' | 'repair' }
  | { kind: 'branch'; target: PfsenseUpdateBranchTarget }
);

function firmwareCheckResult(check: FirmwareCheck, status: PfsenseUpgradeStatusResponse): string {
  const version = status.target_version ?? 'versão nova';
  const error = status.update_check_error;
  switch (check.kind) {
    case 'refresh':
      if (status.update_available === true) return `Atualização encontrada: ${version}.`;
      if (error) return `Checagem concluída com erro: ${error}`;
      return 'Checagem concluída. O pfSense não anunciou atualização nova.';
    case 'repair':
      if (status.update_available === true) return `Reparo concluído. Atualização encontrada: ${version}.`;
      if (error) return `Reparo concluído com erro: ${error}`;
      return 'Reparo concluído. O pfSense não anunciou atualização nova.';
    case 'branch':
      if (status.update_available === true) return `Branch apontado. Atualização encontrada: ${version}.`;
      if (error) return `Branch apontado com erro: ${error}`;
      return `Branch atual: ${status.firmware_branch ?? check.target}. O pfSense ainda não anunciou atualização neste train.`;
  }
}

function errorClassLabel(
  errorClass: string | null,
  checkError?: string | null,
): string | null {
  if (checkError?.includes('set_pfsense_update_branch.php')) {
    return 'O helper de branch do 0.5.14 ficou sem permissão de execução. Atualize o package SystemUp Monitor para 0.5.15+ e tente de novo.';
  }
  switch (errorClass) {
    case 'tls':
      return 'O pkg não confia no certificado dos servidores Netgate. O agente 0.5.13+ tenta certctl rehash sozinho; se persistir, use Reparar repositório.';
    case 'lock':
      return 'Outra operação está usando o gerenciador de pacotes. A consulta aguardará sem remover locks nativos.';
    case 'dns':
      return 'O firewall não resolve o servidor de update (DNS). Confira DNS e rota de saída no pfSense.';
    case 'http':
      return 'O repositório recusou a consulta. O código HTTP não comprova problema de licença.';
    case 'policy':
      return 'A versão não possui canal estável confirmado. Canais de teste não são selecionados automaticamente.';
    case 'network':
    case 'timeout':
      return 'Falha de conexão com o repositório. A consulta pode tentar novamente com espera limitada.';
    case 'ipv6':
      return 'Timeout ou rota IPv6. O agente 0.5.13+ tenta de novo forçando IPv4.';
    case 'metadata':
      return 'Metadados do pkg incompatíveis. Use Reparar repositório (receita oficial Netgate).';
    case 'unknown':
      return 'A checagem falhou. O trecho do log abaixo ajuda a diagnosticar.';
    case 'branch':
      return 'A troca do firmware branch falhou ou o branch pedido ainda não é oferecido neste firewall.';
    default:
      return null;
  }
}

function defaultBranchTarget(
  status: PfsenseUpgradeStatusResponse,
): PfsenseUpdateBranchTarget {
  const version = status.pfsense_version ?? '';
  if (/^2\.7(\.|$)/.test(version)) {
    return '2.8.1';
  }
  if (/^2\.8(\.|$)/.test(version)) {
    return '2.9.0';
  }
  return 'latest';
}

function branchTargetLabel(target: string): string {
  switch (target) {
    case '2.8.1':
      return '2.8.1 (intermediário CE)';
    case '2.9.0':
      return '2.9.0 (CE atual)';
    case 'latest':
      return 'Latest stable (default Netgate)';
    default:
      return target;
  }
}

function looksLikeBehindCeTrack(version: string | null): boolean {
  if (!version) {
    return false;
  }
  const trimmed = version.trim();
  return /^2\.7(\.|$)/.test(trimmed) || /^2\.8\.0(\.|$|-)/.test(trimmed);
}

type Props = {
  nodeId: string;
  nodeEffectiveStatus: string;
  canRunUpgrade: boolean;
  initialStatus: PfsenseUpgradeStatusResponse;
  unavailableSince?: string;
};

function confirmationMatches(hostname: string, value: string): boolean {
  const trimmed = value.trim();
  return trimmed === hostname || trimmed.toUpperCase() === 'CONFIRMAR';
}

function OverlayModal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="theme-overlay fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>,
    document.body,
  );
}

function hasAlternativeFirmware(status: PfsenseUpgradeStatusResponse): boolean {
  return status.update_details?.status === 'channel_required' || status.update_error_class === 'branch' && status.update_available === null && !!status.target_version;
}

function getUpdateLabel(status: PfsenseUpgradeStatusResponse): string {
  if (!status.agent_version_supported) {
    return `Agente ${status.min_agent_version}+ necessário`;
  }
  if (status.update_details?.status === 'checking') return 'Consultando repositórios…';
  if (status.update_details?.status === 'waiting') return 'Aguardando outra operação terminar';
  if (hasAlternativeFirmware(status)) {
    return `Nova versão em outro canal: ${status.target_version}`;
  }
  if (status.update_check_error) {
    return 'Falha ao verificar atualização';
  }
  if (status.update_checked_at == null) {
    return 'Versão não verificada';
  }
  if (status.update_available === true) {
    return `Atualização disponível: ${status.target_version ?? '—'}`;
  }
  if (status.update_available === false) {
    if (looksLikeBehindCeTrack(status.pfsense_version)) {
      return 'Sem atualização no canal selecionado';
    }
    return 'Sem atualização no canal selecionado';
  }
  return 'Status de atualização desconhecido';
}

function getActiveCommandLabel(
  status: PfsenseUpgradeStatusResponse,
  nodeEffectiveStatus: string,
): string | null {
  const command = status.active_command;
  if (!command) {
    return null;
  }

  if (
    ACTIVE_STATUSES.has(command.status) &&
    ['offline', 'unknown'].includes(nodeEffectiveStatus)
  ) {
    return 'Upgrade em andamento — firewall offline (reboot esperado)';
  }

  switch (command.status) {
    case 'pending':
    case 'picked_up':
      return 'Aguardando agente';
    case 'running':
      return 'Executando upgrade no pfSense';
    default:
      return command.status;
  }
}

function getLastResultAlert(
  status: PfsenseUpgradeStatusResponse,
): { variant: 'success' | 'warning' | 'error'; text: string } | null {
  const last = status.last_result;
  if (!last) {
    return null;
  }

  if (last.status === 'failed') {
    return {
      variant: 'error',
      text: `Último upgrade falhou: ${last.error_message ?? 'erro desconhecido'}`,
    };
  }
  if (last.status === 'cancelled') {
    return { variant: 'warning', text: 'Último upgrade cancelado.' };
  }

  if (last.status !== 'succeeded') {
    return null;
  }

  const resultJson =
    last.result_json && typeof last.result_json === 'object' && !Array.isArray(last.result_json)
      ? (last.result_json as Record<string, unknown>)
      : null;
  const finalizeStatus =
    typeof resultJson?.finalize_status === 'string' ? resultJson.finalize_status : null;
  const newVersion =
    typeof resultJson?.new_version === 'string' ? resultJson.new_version : null;
  const resultTarget =
    typeof resultJson?.target_version === 'string'
      ? resultJson.target_version
      : status.target_version;

  if (
    finalizeStatus === 'prepared_manual_confirm' ||
    finalizeStatus === 'executing' ||
    finalizeStatus === 'rebooting' ||
    (status.last_result?.status === 'succeeded' &&
      status.update_available === true &&
      resultTarget != null &&
      newVersion != null &&
      newVersion !== resultTarget)
  ) {
    if (finalizeStatus === 'executing' || finalizeStatus === 'rebooting') {
      return {
        variant: 'warning',
        text: 'Upgrade em execução no pfSense — aguarde o reboot (~15–90 min). O status será atualizado após o firewall voltar online.',
      };
    }
    if (finalizeStatus === 'prepared_manual_confirm') {
      return {
        variant: 'warning',
        text: `Execução remota desabilitada no agente. Confirme em System → Update no pfSense para aplicar ${resultTarget ?? 'a versão alvo'}.`,
      };
    }
    return {
      variant: 'warning',
      text: `Comando encerrado no controlador, mas a versão instalada ainda não mudou. Aguarde o reboot ou verifique System → Update no pfSense.`,
    };
  }

  if (status.update_available === true) {
    return null;
  }

  return {
    variant: 'success',
    text: 'Último upgrade concluído com sucesso.',
  };
}

export function NodePfsenseUpgradeSection({
  nodeId,
  nodeEffectiveStatus,
  canRunUpgrade,
  initialStatus,
  unavailableSince,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [enableMaintenance, setEnableMaintenance] = useState(true);
  const [ackNoBackup, setAckNoBackup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingCheck, setRefreshingCheck] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [repairConfirmText, setRepairConfirmText] = useState('');
  const [repairing, setRepairing] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchConfirmText, setBranchConfirmText] = useState('');
  const [branchTarget, setBranchTarget] = useState<PfsenseUpdateBranchTarget>(
    defaultBranchTarget(initialStatus),
  );
  const [settingBranch, setSettingBranch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firmwareCheck, setFirmwareCheck] = useState<FirmwareCheck | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const { receipt, rememberReceipt, observeStatus } = useUpgradeReceipt();
  const [recoveredSnapshot, setRecoveredSnapshot] = useState<string>();
  const statusUnavailable = unavailableSince !== undefined && recoveredSnapshot !== unavailableSince;
  const readStatus = useScopedRead(nodeId, unavailableSince ?? initialStatus);

  const applyStatus = useCallback((next: PfsenseUpgradeStatusResponse) => {
    setStatus(next);
    observeStatus(next);
    setPollFailed(false);
  }, [observeStatus]);

  useEffect(() => { applyStatus(initialStatus); }, [applyStatus, initialStatus]);

  const refreshStatus = useCallback((replace = false) => readStatus(
    () => pollPfsenseUpgradeStatusAction(nodeId),
    (next) => {
      applyStatus(next);
      setRecoveredSnapshot(unavailableSince);
    },
    () => setPollFailed(true),
    replace,
  ), [applyStatus, nodeId, readStatus, unavailableSince]);

  const checkingFirmware = firmwareCheck != null || status.force_check_pending
    || status.repair_pending || status.set_branch_pending;
  const trackingUpgrade = receipt != null || (status.active_command != null
    && ACTIVE_STATUSES.has(status.active_command.status));
  const tracking = statusUnavailable || trackingUpgrade || checkingFirmware
    || ['checking', 'waiting'].includes(status.update_details?.status ?? '');

  useEffect(() => {
    if (!tracking || submitting) return;

    const timer = window.setInterval(() => {
      void refreshStatus();
    }, checkingFirmware ? REFRESH_POLL_INTERVAL_MS : POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [checkingFirmware, refreshStatus, submitting, tracking]);

  useEffect(() => {
    if (!firmwareCheck) return;
    const settings = firmwareCheckSettings[firmwareCheck.kind];
    const requestedAt = Date.parse(firmwareCheck.requestedAt);
    const statusRequest = status[settings.requestedKey];
    if (Date.parse(statusRequest ?? '') > requestedAt) {
      setRefreshMessage(null);
      setError('Este pedido foi substituído por uma solicitação mais recente.');
      setFirmwareCheck(null);
      return;
    }
    if (firmwareCheck.kind === 'repair' && Date.parse(status.set_branch_requested_at ?? '') > requestedAt) {
      setRefreshMessage(null);
      setError('A execução do reparo ficou sem confirmação após um pedido de mudança de branch.');
      setFirmwareCheck(null);
      return;
    }
    const checkedAt = status.update_checked_at;
    if (statusRequest === firmwareCheck.requestedAt
      && !status[settings.pendingKey]
      && checkedAt
      && Date.parse(checkedAt) > requestedAt) {
      setRefreshMessage(firmwareCheckResult(firmwareCheck, status));
      setFirmwareCheck(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      setRefreshMessage(settings.timeoutMessage);
      setFirmwareCheck(null);
    }, Math.max(0, firmwareCheck.deadline - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [firmwareCheck, status]);

  const blockReason = useMemo(() => {
    if (statusUnavailable) return 'Aguardando uma consulta atualizada do pfSense';
    if (!status.enabled) {
      return 'Upgrade remoto desabilitado no controlador';
    }
    if (!canRunUpgrade) {
      return 'Sem permissão para disparar upgrade';
    }
    if (!status.agent_version_supported) {
      return `Agente ${status.min_agent_version}+ necessário`;
    }
    if (status.ha_blocked) {
      return 'Upgrade bloqueado em cluster HA';
    }
    if (hasAlternativeFirmware(status)) return 'Selecione um canal estável e consulte novamente';
    if (status.update_details?.status === 'checking') return 'Consulta em andamento';
    if (status.update_details?.status === 'waiting') return 'Aguardando outra operação terminar';
    if (status.update_check_error) {
      return 'Falha na checagem de atualização pelo agente';
    }
    if (status.update_available == null) {
      return 'Aguardando verificação de atualização';
    }
    if (status.update_available === false) {
      return 'Nenhuma atualização disponível';
    }
    return null;
  }, [canRunUpgrade, status, statusUnavailable]);

  const showUpgradeButton =
    status.enabled &&
    status.update_available === true &&
    !status.active_command &&
    !receipt &&
    !statusUnavailable &&
    canRunUpgrade &&
    status.agent_version_supported &&
    !status.ha_blocked;

  const needsBackupOverride =
    status.backup_gate.requires_recent_backup &&
    !status.backup_gate.has_recent_backup;

  const confirmEnabled =
    confirmationMatches(status.hostname, confirmText) &&
    (!needsBackupOverride || ackNoBackup);

  const checking = refreshingCheck || firmwareCheck?.kind === 'refresh';
  const repairingRepo = repairing || firmwareCheck?.kind === 'repair';
  const switchingBranch = settingBranch || firmwareCheck?.kind === 'branch';
  const refreshCheckTitle = !canRunUpgrade
    ? 'Sem permissão para disparar upgrade'
    : !status.refresh_check_supported
      ? `Agente ${status.refresh_check_min_agent_version}+ necessário para atualizar os repositórios pkg`
      : status.force_check_pending ||
          status.repair_pending ||
          status.set_branch_pending ||
          checking
        ? 'Aguardando o agente atualizar os repositórios e rechecar'
        : undefined;

  const repairTitle = !canRunUpgrade
    ? 'Sem permissão para disparar upgrade'
    : !status.repair_supported
      ? `Agente ${status.repair_min_agent_version}+ necessário para reparar o repositório pkg`
      : status.repair_pending || repairingRepo
        ? 'Aguardando o agente executar o reparo oficial do repositório'
        : undefined;

  const setBranchTitle = !canRunUpgrade
    ? 'Sem permissão para disparar upgrade'
    : !status.set_branch_supported
      ? `Agente ${status.set_branch_min_agent_version}+ necessário para apontar o firmware branch`
      : status.set_branch_pending || switchingBranch
        ? 'Aguardando o agente apontar o branch e rechecar'
        : undefined;

  const busyUpdateAction =
    statusUnavailable ||
    refreshingCheck ||
    repairing ||
    settingBranch ||
    checkingFirmware;

  const handleRefreshCheck = async () => {
    if (statusUnavailable) return;
    setRefreshingCheck(true);
    setRefreshMessage(null);
    setError(null);
    try {
      const result = await requestPfsenseUpdateRefreshCheckAction(nodeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setRefreshMessage(
        'Pedido enviado. O agente vai atualizar os repositórios pkg no próximo heartbeat (~30s).',
      );

      setFirmwareCheck({
        kind: 'refresh',
        requestedAt: result.data.requested_at,
        deadline: Date.now() + 180_000,
      });
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Falha ao solicitar nova verificação',
      );
    } finally {
      setRefreshingCheck(false);
    }
  };

  const handleRepairRepo = async () => {
    if (statusUnavailable) return;
    if (!confirmationMatches(status.hostname, repairConfirmText)) {
      setError('Digite o hostname ou CONFIRMAR para reparar o repositório.');
      return;
    }

    setRepairing(true);
    setRefreshMessage(null);
    setError(null);
    try {
      const result = await requestPfsenseRepoRepairAction(nodeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setRepairModalOpen(false);
      setRepairConfirmText('');
      setRefreshMessage(
        'Reparo pedido. O agente vai limpar o cache pkg e reinstalar pfSense-repo / pfSense-upgrade no próximo heartbeat.',
      );

      setFirmwareCheck({
        kind: 'repair',
        requestedAt: result.data.requested_at,
        deadline: Date.now() + 240_000,
      });
    } catch (repairError) {
      setError(
        repairError instanceof Error
          ? repairError.message
          : 'Falha ao solicitar reparo do repositório',
      );
    } finally {
      setRepairing(false);
    }
  };

  const handleSetBranch = async () => {
    if (statusUnavailable) return;
    if (!confirmationMatches(status.hostname, branchConfirmText)) {
      setError('Digite o hostname ou CONFIRMAR para apontar o firmware branch.');
      return;
    }

    setSettingBranch(true);
    setRefreshMessage(null);
    setError(null);
    try {
      const result = await requestPfsenseSetBranchAction(nodeId, branchTarget);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setBranchModalOpen(false);
      setBranchConfirmText('');
      setRefreshMessage(
        `Pedido enviado. O agente vai apontar o branch para ${branchTargetLabel(branchTarget)} e rechecar no próximo heartbeat.`,
      );

      setFirmwareCheck({
        kind: 'branch',
        requestedAt: result.data.requested_at,
        deadline: Date.now() + 240_000,
        target: branchTarget,
      });
    } catch (branchError) {
      setError(
        branchError instanceof Error
          ? branchError.message
          : 'Falha ao solicitar troca do firmware branch',
      );
    } finally {
      setSettingBranch(false);
    }
  };

  const handleRequest = async () => {
    if (statusUnavailable) return;
    setSubmitting(true);
    setError(null);
    try {
      const latest = await refreshStatus(true);
      if (!latest) {
        setError('Não foi possível confirmar o estado atual do pfSense. Tente novamente.');
        return;
      }

      if (latest.update_available !== true) {
        setError(
          'A verificação mudou e não há mais atualização disponível. Aguarde o próximo heartbeat ou force a checagem no pfSense.',
        );
        return;
      }

      const result = await requestPfsenseUpgradeAction(nodeId, {
        enable_maintenance_mode: enableMaintenance,
        acknowledge_no_recent_backup: needsBackupOverride ? ackNoBackup : undefined,
      });

      if (!result.ok) {
        setError(result.error);
        await refreshStatus(true);
        return;
      }

      rememberReceipt(result.data);
      setModalOpen(false);
      setConfirmText('');
      setAckNoBackup(false);
      await refreshStatus(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Falha ao solicitar upgrade',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const activeLabel = getActiveCommandLabel(status, nodeEffectiveStatus);
  const lastResultAlert = getLastResultAlert(status);

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h3 className="font-display text-base text-slate-100">Atualização pfSense OS</h3>
          <p className="mt-1 text-sm text-slate-400">
            Detecta novas versões via agente e aplica upgrade remoto completo (reboot automático
            ~15–90 min). A confirmação neste painel substitui o passo manual em System → Update no
            pfSense.
          </p>
        </div>

        <div className="grid gap-2 text-sm text-slate-300">
          <p>
            <span className="text-slate-500">Versão instalada:</span>{' '}
            {status.pfsense_version ?? '—'}
          </p>
          <p>
            <span className="text-slate-500">Verificação:</span> {getUpdateLabel(status)}
          </p>
          {status.update_checked_at ? (
            <p>
              <span className="text-slate-500">Última checagem:</span>{' '}
              {formatDateTime(status.update_checked_at)}
            </p>
          ) : null}
          {status.firmware_branch || status.firmware_branch_descr ? (
            <p>
              <span className="text-slate-500">Firmware branch:</span>{' '}
              {status.firmware_branch ?? '—'}
              {status.firmware_branch_descr
                ? ` — ${status.firmware_branch_descr}`
                : ''}
            </p>
          ) : null}
        </div>

        {activeLabel ? (
          <Alert variant="warning">{activeLabel}</Alert>
        ) : null}
        {receipt && !activeLabel ? (
          <Alert variant="info">Solicitação aceita. Aguardando o status da atualização.</Alert>
        ) : null}
        {statusUnavailable || (pollFailed && tracking) ? (
          <Alert variant="warning">Consulta temporariamente indisponível. O acompanhamento continua.</Alert>
        ) : null}

        {hasAlternativeFirmware(status) ? (
          <Alert variant="warning">A versão {status.target_version} está em outro canal. Use Apontar branch para selecionar um canal estável e consultar novamente. Isso não instala o firmware.</Alert>
        ) : null}
        {status.update_details?.http_status ? (
          <p>Repositório: HTTP {status.update_details.http_status}</p>
        ) : null}
        {status.update_details?.status === 'error' || status.update_details?.status === 'waiting' ? (
          <p className="text-sm text-slate-500">
            {status.update_details.retry_exhausted ? 'Tentativas rápidas esgotadas. ' : ''}
            {status.update_details.next_check_at ? `Próxima consulta: ${formatDateTime(status.update_details.next_check_at)}.` : ''}
          </p>
        ) : null}

        {status.update_check_error ? (
          <Alert variant="warning">
            {status.update_details?.status === 'waiting' ? 'Consulta adiada: ' : hasAlternativeFirmware(status) ? 'Seleção de canal necessária: ' : 'Falha ao verificar atualização: '}{status.update_check_error}
            {!hasAlternativeFirmware(status) && errorClassLabel(status.update_error_class, status.update_check_error) ? (
              <span className="mt-2 block text-xs">
                {errorClassLabel(status.update_error_class, status.update_check_error)}
              </span>
            ) : null}
            {status.update_log_snippet ? (
              <span className="mt-2 block font-mono text-xs text-slate-400">
                Log: {status.update_log_snippet}
              </span>
            ) : null}
          </Alert>
        ) : null}

        {status.update_available === false &&
        looksLikeBehindCeTrack(status.pfsense_version) ? (
          <Alert variant="warning">
            {status.firmware_branch ? (
              <>
                Este firewall está em {status.pfsense_version} no branch{' '}
                <strong>{status.firmware_branch}</strong>. O check oficial
                pode estar correto neste train — 2.9.0 fica em outro branch.
                Use <strong>Apontar branch</strong> (0.5.14+) para Latest
                stable / 2.8.1 / 2.9.0, sem mudar a versão do OS ainda.
              </>
            ) : (
              <>
                Este firewall está em {status.pfsense_version}. A checagem do
                agente pode ter lido metadados pkg velhos e reportado
                “atualizado”. Use Atualizar verificação (0.5.12+), Reparar
                repositório (0.5.13+) ou Apontar branch (0.5.14+).
              </>
            )}
          </Alert>
        ) : null}

        {status.set_branch_pending ? (
          <Alert variant="warning">
            Troca de firmware branch pedida ({status.set_branch_target ?? '…'})
            — aguardando o agente no próximo heartbeat (pode levar 1–3 min).
          </Alert>
        ) : null}

        {status.repair_pending ? (
          <Alert variant="warning">
            Reparo do repositório pedido — aguardando o agente no próximo
            heartbeat (pode levar 1–3 min).
          </Alert>
        ) : null}

        {status.force_check_pending &&
        !status.repair_pending &&
        !status.set_branch_pending ? (
          <Alert variant="warning">
            Verificação pedida — aguardando o agente atualizar os repositórios e
            rechecar no próximo heartbeat.
          </Alert>
        ) : null}

        {refreshMessage ? <Alert variant="success">{refreshMessage}</Alert> : null}

        {lastResultAlert ? (
          <Alert variant={lastResultAlert.variant}>{lastResultAlert.text}</Alert>
        ) : null}

        {error && !modalOpen && !repairModalOpen && !branchModalOpen ? (
          <Alert variant="error">{error}</Alert>
        ) : null}

        {blockReason && !showUpgradeButton ? (
          <p className="text-xs text-slate-500">{blockReason}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canRunUpgrade || !status.refresh_check_supported || busyUpdateAction}
            title={refreshCheckTitle}
            onClick={() => void handleRefreshCheck()}
          >
            {checking || status.force_check_pending
              ? 'Verificando...'
              : 'Atualizar verificação'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canRunUpgrade || !status.repair_supported || busyUpdateAction}
            title={repairTitle}
            onClick={() => {
              setError(null);
              setRepairModalOpen(true);
            }}
          >
            {repairingRepo || status.repair_pending
              ? 'Reparando...'
              : 'Reparar repositório'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canRunUpgrade || !status.set_branch_supported || busyUpdateAction}
            title={setBranchTitle}
            onClick={() => {
              setError(null);
              setBranchTarget(defaultBranchTarget(status));
              setBranchModalOpen(true);
            }}
          >
            {switchingBranch || status.set_branch_pending
              ? 'Apontando branch...'
              : 'Apontar branch'}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!showUpgradeButton}
            title={!showUpgradeButton ? (blockReason ?? undefined) : undefined}
            onClick={async () => {
              setError(null);
              await refreshStatus(true);
              setModalOpen(true);
            }}
          >
            Atualizar pfSense
          </Button>
          {!status.enabled ? (
            <span className="text-xs text-slate-500">Feature flag desligada no controlador</span>
          ) : null}
        </div>
      </div>

      {modalOpen ? (
        <OverlayModal>
          <div className="mx-auto my-6 w-full max-w-lg rounded-xl border border-amber-500/30 bg-slate-900 p-6 shadow-xl">
            <h2 className="font-display text-lg text-amber-200">Confirmar upgrade pfSense</h2>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <p>
                O firewall <strong>{status.hostname}</strong> será atualizado para{' '}
                <strong>{status.target_version ?? 'versão alvo'}</strong> e reiniciará.
                O processo pode levar de 15 a 90 minutos.
              </p>

              {needsBackupOverride ? (
                <Alert variant="warning">
                  Não há backup config.xml recente (
                  {status.backup_gate.require_recent_backup_hours}h).{' '}
                  <Link
                    href={`/nodes/${nodeId}?tab=backup`}
                    className="underline hover:text-amber-100"
                  >
                    Solicitar backup agora
                  </Link>
                </Alert>
              ) : null}

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={enableMaintenance}
                  onChange={(event) => setEnableMaintenance(event.target.checked)}
                />
                Ativar maintenance mode antes do upgrade (restaura automaticamente ao finalizar)
              </label>

              {needsBackupOverride ? (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={ackNoBackup}
                    onChange={(event) => setAckNoBackup(event.target.checked)}
                  />
                  Prosseguir sem backup recente (assumo o risco)
                </label>
              ) : null}

              <label className="block">
                <span className="text-slate-400">
                  Digite o hostname <code>{status.hostname}</code> ou CONFIRMAR:
                </span>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </label>

              {error ? <Alert variant="error">{error}</Alert> : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting || !confirmEnabled || statusUnavailable}
                onClick={() => void handleRequest()}
                className="rounded-lg border border-amber-500/60 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {submitting ? 'Processando...' : 'Confirmar upgrade'}
              </button>
            </div>
          </div>
        </OverlayModal>
      ) : null}

      {repairModalOpen ? (
        <OverlayModal>
          <div className="mx-auto my-6 w-full max-w-lg rounded-xl border border-slate-600 bg-slate-900 p-6 shadow-xl">
            <h2 className="font-display text-lg text-slate-100">
              Reparar repositório de update
            </h2>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <p>
                No firewall <strong>{status.hostname}</strong> o agente vai
                executar a receita oficial da Netgate: <code>certctl rehash</code>
                , <code>pkg-static clean -ay</code>, reinstalar{' '}
                <code>pkg</code>, <code>pfSense-repo</code> e{' '}
                <code>pfSense-upgrade</code>, e depois checar o OS de novo.
              </p>
              <p className="text-slate-400">
                Não altera a versão do pfSense nem o firmware branch. Não
                reinstala todos os packages do sistema.
              </p>
              <label className="block">
                <span className="text-slate-400">
                  Digite o hostname <code>{status.hostname}</code> ou CONFIRMAR:
                </span>
                <input
                  type="text"
                  value={repairConfirmText}
                  onChange={(event) => setRepairConfirmText(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </label>
              {error ? <Alert variant="error">{error}</Alert> : null}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={repairing}
                onClick={() => setRepairModalOpen(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  statusUnavailable || repairing ||
                  !confirmationMatches(status.hostname, repairConfirmText)
                }
                onClick={() => void handleRepairRepo()}
                className="rounded-lg border border-slate-500 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
              >
                {repairing ? 'Processando...' : 'Confirmar reparo'}
              </button>
            </div>
          </div>
        </OverlayModal>
      ) : null}

      {branchModalOpen ? (
        <OverlayModal>
          <div className="mx-auto my-6 w-full max-w-lg rounded-xl border border-slate-600 bg-slate-900 p-6 shadow-xl">
            <h2 className="font-display text-lg text-slate-100">
              Apontar firmware branch
            </h2>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <p>
                No firewall <strong>{status.hostname}</strong> o agente vai
                gravar o mesmo campo da GUI (
                <code>system/pkg_repo_conf_path</code>) e chamar{' '}
                <code>pkg_switch_repo()</code>, depois rechecar o OS.
              </p>
              <p className="text-slate-400">
                Não atualiza o pfSense agora. Só muda o train de update
                (allowlist: Latest stable, 2.8.1, 2.9.0). Devel, snapshot e
                Plus upgrade estão bloqueados.
              </p>
              <label className="block">
                <span className="text-slate-400">Branch alvo</span>
                <select
                  value={branchTarget}
                  onChange={(event) =>
                    setBranchTarget(
                      event.target.value as PfsenseUpdateBranchTarget,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                >
                  {status.allowed_branch_targets.map((target) => (
                    <option key={target} value={target}>
                      {branchTargetLabel(target)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-400">
                  Digite o hostname <code>{status.hostname}</code> ou CONFIRMAR:
                </span>
                <input
                  type="text"
                  value={branchConfirmText}
                  onChange={(event) => setBranchConfirmText(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </label>
              {error ? <Alert variant="error">{error}</Alert> : null}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={settingBranch}
                onClick={() => setBranchModalOpen(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  statusUnavailable || settingBranch ||
                  !confirmationMatches(status.hostname, branchConfirmText)
                }
                onClick={() => void handleSetBranch()}
                className="rounded-lg border border-slate-500 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
              >
                {settingBranch ? 'Processando...' : 'Confirmar branch'}
              </button>
            </div>
          </div>
        </OverlayModal>
      ) : null}
    </Card>
  );
}
