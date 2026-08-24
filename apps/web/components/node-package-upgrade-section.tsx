'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PackageUpgradeStatusResponse } from '@/lib/api';
import {
  pollPackageUpgradeStatusAction,
  requestPackageUpgradeAction,
} from '@/lib/package-upgrade';
import { formatDateTime } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const ACTIVE_STATUSES = new Set(['pending', 'picked_up', 'running']);
const POLL_INTERVAL_MS = 12_000;

type Props = {
  nodeId: string;
  canRunPackageUpgrade: boolean;
  initialStatus: PackageUpgradeStatusResponse;
};

function getActiveCommandLabel(status: PackageUpgradeStatusResponse): string | null {
  const command = status.active_command;
  if (!command) {
    return null;
  }

  switch (command.status) {
    case 'pending':
    case 'picked_up':
      return 'Aguardando agente executar atualização do package';
    case 'running':
      return 'Atualizando package SystemUp Monitor no pfSense';
    default:
      return command.status;
  }
}

export function NodePackageUpgradeSection({
  nodeId,
  canRunPackageUpgrade,
  initialStatus,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await pollPackageUpgradeStatusAction(nodeId);
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
    if (!canRunPackageUpgrade) {
      return 'Sem permissão para disparar upgrade de package';
    }
    if (!status.update_available) {
      return 'Agente já está na versão publicada';
    }
    if (!status.agent_version_supported) {
      return `Requer agente ${status.min_agent_version}+ (primeira instalação manual necessária)`;
    }
    return null;
  }, [canRunPackageUpgrade, status]);

  const showUpgradeButton =
    status.enabled &&
    status.update_available &&
    !status.active_command &&
    canRunPackageUpgrade &&
    status.agent_version_supported;

  const confirmEnabled = confirmText.trim().toUpperCase() === 'CONFIRMAR';

  const handleRequest = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestPackageUpgradeAction(nodeId);
      if (!result.ok) {
        setError(result.error);
        await refreshStatus();
        return;
      }

      setModalOpen(false);
      setConfirmText('');
      await refreshStatus();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Falha ao solicitar upgrade de package',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const activeLabel = getActiveCommandLabel(status);

  return (
    <Card className="mt-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-display text-base text-slate-100">
            Atualização do package SystemUp Monitor
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Dispara upgrade remoto via heartbeat (comando <code>package_upgrade</code>).
            Requer agente {status.min_agent_version}+ — a primeira instalação dessa versão ainda é manual.
          </p>
        </div>

        <div className="grid gap-2 text-sm text-slate-300">
          <p>
            <span className="text-slate-500">Versão instalada:</span>{' '}
            {status.agent_version ?? '—'}
          </p>
          <p>
            <span className="text-slate-500">Versão publicada:</span>{' '}
            {status.published_version}
          </p>
          {status.last_seen_at ? (
            <p>
              <span className="text-slate-500">Último contato:</span>{' '}
              {formatDateTime(status.last_seen_at)}
            </p>
          ) : null}
        </div>

        {activeLabel ? <Alert variant="warning">{activeLabel}</Alert> : null}

        {status.last_result?.status === 'failed' ? (
          <Alert variant="error">
            Última atualização falhou:{' '}
            {status.last_result.error_message ?? 'erro desconhecido'}
          </Alert>
        ) : null}

        {status.last_result?.status === 'succeeded' ? (
          <Alert variant="success">Última atualização de package concluída com sucesso.</Alert>
        ) : null}

        {blockReason && !showUpgradeButton ? (
          <p className="text-xs text-slate-500">{blockReason}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!showUpgradeButton}
            title={!showUpgradeButton ? (blockReason ?? undefined) : undefined}
            onClick={() => {
              setError(null);
              setModalOpen(true);
            }}
          >
            Atualizar package remotamente
          </Button>
        </div>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center theme-overlay"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-4 w-full max-w-lg rounded-xl border border-cyan-500/30 bg-slate-900 p-6 shadow-xl">
            <h2 className="font-display text-lg text-cyan-200">
              Confirmar upgrade remoto do package
            </h2>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <p>
                O firewall <strong>{status.hostname}</strong> será atualizado para o package{' '}
                <strong>{status.published_version}</strong>. O agente baixa o artefato, valida
                SHA256 e executa <code>install-from-release.sh</code> em segundo plano.
              </p>

              <label className="block">
                <span className="text-slate-400">Digite CONFIRMAR para continuar:</span>
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
                className="rounded-lg border border-cyan-500/60 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
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
