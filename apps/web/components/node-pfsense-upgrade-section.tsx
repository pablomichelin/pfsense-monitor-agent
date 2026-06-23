'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PfsenseUpgradeStatusResponse } from '@/lib/api';
import {
  pollPfsenseUpgradeStatusAction,
  requestPfsenseUpgradeAction,
} from '@/lib/pfsense-upgrade';
import { formatDateTime } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const ACTIVE_STATUSES = new Set(['pending', 'picked_up', 'running']);
const POLL_INTERVAL_MS = 12_000;

type Props = {
  nodeId: string;
  nodeEffectiveStatus: string;
  canRunUpgrade: boolean;
  initialStatus: PfsenseUpgradeStatusResponse;
};

function confirmationMatches(hostname: string, value: string): boolean {
  const trimmed = value.trim();
  return trimmed === hostname || trimmed.toUpperCase() === 'CONFIRMAR';
}

function getUpdateLabel(status: PfsenseUpgradeStatusResponse): string {
  if (!status.agent_version_supported) {
    return `Agente ${status.min_agent_version}+ necessário`;
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
    return 'pfSense atualizado';
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

export function NodePfsenseUpgradeSection({
  nodeId,
  nodeEffectiveStatus,
  canRunUpgrade,
  initialStatus,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [enableMaintenance, setEnableMaintenance] = useState(true);
  const [ackNoBackup, setAckNoBackup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await pollPfsenseUpgradeStatusAction(nodeId);
      setStatus(next);
    } catch {
      // polling silencioso
    }
  }, [nodeId]);

  useEffect(() => {
    if (!status.active_command || !ACTIVE_STATUSES.has(status.active_command.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshStatus();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [refreshStatus, status.active_command]);

  const blockReason = useMemo(() => {
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
  }, [canRunUpgrade, status]);

  const showUpgradeButton =
    status.enabled &&
    status.update_available === true &&
    !status.active_command &&
    canRunUpgrade &&
    status.agent_version_supported &&
    !status.ha_blocked;

  const needsBackupOverride =
    status.backup_gate.requires_recent_backup &&
    !status.backup_gate.has_recent_backup;

  const confirmEnabled =
    confirmationMatches(status.hostname, confirmText) &&
    (!needsBackupOverride || ackNoBackup);

  const handleRequest = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const latest = await pollPfsenseUpgradeStatusAction(nodeId);
      setStatus(latest);

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
        await refreshStatus();
        return;
      }

      setModalOpen(false);
      setConfirmText('');
      setAckNoBackup(false);
      await refreshStatus();
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

  return (
    <Card className="mt-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-display text-base text-slate-100">Atualização pfSense OS</h3>
          <p className="mt-1 text-sm text-slate-400">
            Detecta novas versões via agente e permite upgrade individual (reboot ~15–90 min).
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
        </div>

        {activeLabel ? (
          <Alert variant="warning">{activeLabel}</Alert>
        ) : null}

        {status.update_check_error ? (
          <Alert variant="warning">
            Falha ao verificar atualização: {status.update_check_error}
          </Alert>
        ) : null}

        {status.last_result?.status === 'failed' ? (
          <Alert variant="error">
            Último upgrade falhou: {status.last_result.error_message ?? 'erro desconhecido'}
          </Alert>
        ) : null}

        {status.last_result?.status === 'succeeded' ? (
          <Alert variant="success">Último upgrade concluído com sucesso.</Alert>
        ) : null}

        {blockReason && !showUpgradeButton ? (
          <p className="text-xs text-slate-500">{blockReason}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!showUpgradeButton}
            title={!showUpgradeButton ? (blockReason ?? undefined) : undefined}
            onClick={async () => {
              setError(null);
              try {
                const latest = await pollPfsenseUpgradeStatusAction(nodeId);
                setStatus(latest);
              } catch {
                // mantém status atual se o refresh falhar
              }
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-4 w-full max-w-lg rounded-xl border border-amber-500/30 bg-slate-900 p-6 shadow-xl">
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
                disabled={submitting || !confirmEnabled}
                onClick={() => void handleRequest()}
                className="rounded-lg border border-amber-500/60 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {submitting ? 'Processando...' : 'Confirmar upgrade'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
