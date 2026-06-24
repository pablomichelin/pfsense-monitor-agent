'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConfigBackupCommandStatusResponse,
  ConfigBackupItem,
  NodeConfigBackupsResponse,
} from '@/lib/api';
import {
  pollConfigBackupCommandAction,
  requestConfigBackupAction,
} from '@/lib/backups';
import { BackupDownloadButton } from '@/components/backup-download-button';
import {
  formatBackupAge,
  formatBytes,
  formatDateTime,
  shortSha256,
} from '@/lib/format';

type BackupVisualStatus = 'ok' | 'late' | 'failed' | 'never';

type Props = {
  nodeId: string;
  nodeEffectiveStatus: string;
  canRequest: boolean;
  canDownload: boolean;
  initialBackups: NodeConfigBackupsResponse;
  auditHref?: string;
};

const ACTIVE_COMMAND_STATUSES = new Set([
  'pending',
  'picked_up',
  'running',
]);

const TERMINAL_COMMAND_STATUSES = new Set([
  'succeeded',
  'failed',
  'expired',
  'cancelled',
]);

const statusStyles: Record<
  BackupVisualStatus,
  { label: string; pill: string; dot: string }
> = {
  ok: {
    label: 'Em dia',
    pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]',
  },
  late: {
    label: 'Atrasado',
    pill: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    dot: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]',
  },
  failed: {
    label: 'Falhou',
    pill: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    dot: 'bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]',
  },
  never: {
    label: 'Nunca enviado',
    pill: 'border-slate-600/80 bg-slate-800/60 text-slate-300',
    dot: 'bg-slate-500',
  },
};

function resolveVisualStatus(
  backups: NodeConfigBackupsResponse,
  commandStatus: ConfigBackupCommandStatusResponse | null,
): BackupVisualStatus {
  if (commandStatus?.status === 'failed') {
    return 'failed';
  }

  return backups.visual_status;
}

function getLatestStoredBackup(
  items: ConfigBackupItem[],
): ConfigBackupItem | null {
  return items.find((item) => item.status === 'stored') ?? null;
}

function getCommandStatusLabel(input: {
  status: ConfigBackupCommandStatusResponse['status'];
  nodeEffectiveStatus: string;
  resultJson: Record<string, unknown> | null;
}): string {
  if (
    ACTIVE_COMMAND_STATUSES.has(input.status) &&
    ['offline', 'unknown'].includes(input.nodeEffectiveStatus)
  ) {
    return 'Firewall offline';
  }

  switch (input.status) {
    case 'pending':
    case 'picked_up':
      return 'Aguardando firewall';
    case 'running':
      return 'Executando no pfSense';
    case 'succeeded':
      return input.resultJson?.duplicate === true
        ? 'Recebido sem alteracao'
        : 'Backup recebido';
    case 'failed':
      return 'Falhou';
    case 'expired':
      return 'Expirou';
    case 'cancelled':
      return 'Cancelado';
    default:
      return input.status;
  }
}

function backupRowStatusLabel(status: ConfigBackupItem['status']): string {
  return status === 'stored' ? 'armazenado' : 'duplicado';
}

export function NodeConfigBackupsSection({
  nodeId,
  nodeEffectiveStatus,
  canRequest,
  canDownload,
  initialBackups,
  auditHref,
}: Props) {
  const router = useRouter();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [commandStatus, setCommandStatus] =
    useState<ConfigBackupCommandStatusResponse | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const latestStored = useMemo(
    () => getLatestStoredBackup(initialBackups.items),
    [initialBackups.items],
  );

  const visualStatus = useMemo(
    () => resolveVisualStatus(initialBackups, commandStatus),
    [initialBackups, commandStatus],
  );

  const statusStyle = statusStyles[visualStatus];

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollCommand = useCallback(
    async (commandId: string) => {
      try {
        const status = await pollConfigBackupCommandAction(nodeId, commandId);
        setCommandStatus(status);

        if (TERMINAL_COMMAND_STATUSES.has(status.status)) {
          clearPollTimer();
          router.refresh();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha ao consultar comando';
        setRequestError(message);
        clearPollTimer();
      }
    },
    [clearPollTimer, nodeId, router],
  );

  const startPolling = useCallback(
    (commandId: string) => {
      clearPollTimer();
      void pollCommand(commandId);
      pollTimerRef.current = window.setInterval(() => {
        void pollCommand(commandId);
      }, 5000);
    },
    [clearPollTimer, pollCommand],
  );

  useEffect(() => () => clearPollTimer(), [clearPollTimer]);

  const handleRequestBackup = async () => {
    setRequestError(null);
    setRequesting(true);

    try {
      const response = await requestConfigBackupAction(nodeId);
      setCommandStatus({
        command_id: response.command_id,
        node_id: nodeId,
        type: 'config_backup_now',
        status: response.status,
        requested_at: new Date().toISOString(),
        picked_up_at: null,
        completed_at: null,
        expires_at: response.expires_at,
        result_json: null,
        error_message: null,
      });
      startPolling(response.command_id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao solicitar backup';
      setRequestError(message);
    } finally {
      setRequesting(false);
    }
  };

  const commandLabel = commandStatus
    ? getCommandStatusLabel({
        status: commandStatus.status,
        nodeEffectiveStatus,
        resultJson: commandStatus.result_json,
      })
    : null;

  const commandActive =
    commandStatus !== null &&
    ACTIVE_COMMAND_STATUSES.has(commandStatus.status);

  return (
    <section className="glass-panel rounded-xl p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
            Backups de configuracao
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Histórico do <code className="text-cyan-200">/conf/config.xml</code>{' '}
            enviado pelo package pfSense.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${statusStyle.pill}`}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${statusStyle.dot}`}
              aria-hidden
            />
            {statusStyle.label}
          </span>
          {canRequest ? (
            <button
              type="button"
              onClick={handleRequestBackup}
              disabled={requesting || commandActive}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requesting
                ? 'Solicitando...'
                : commandActive
                  ? 'Aguardando resposta...'
                  : 'Solicitar backup agora'}
            </button>
          ) : null}
          {auditHref ? (
            <Link
              href={auditHref}
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Auditoria
            </Link>
          ) : null}
        </div>
      </div>

      {requestError ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {requestError}
        </div>
      ) : null}

      {commandLabel ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            commandStatus?.status === 'failed' || commandStatus?.status === 'expired'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              : commandStatus?.status === 'succeeded'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
          }`}
        >
          <p>{commandLabel}</p>
          {commandStatus?.error_message ? (
            <p className="mt-1 text-xs opacity-90">{commandStatus.error_message}</p>
          ) : null}
          {commandActive ? (
            <p className="mt-1 text-xs opacity-80">
              Atualizando a cada 5s enquanto o comando estiver ativo.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
            Ultimo backup
          </p>
          <p className="mt-2 text-sm text-white">
            {formatDateTime(
              latestStored?.received_at ??
                initialBackups.summary.latest_received_at,
            )}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
            Idade
          </p>
          <p className="mt-2 text-sm text-white">
            {formatBackupAge(
              latestStored?.received_at ??
                initialBackups.summary.latest_received_at,
            )}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
            Tamanho
          </p>
          <p className="mt-2 text-sm text-white">
            {formatBytes(latestStored?.size_bytes ?? null)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
            SHA256
          </p>
          <p className="mt-2 font-mono text-sm text-cyan-200">
            {shortSha256(latestStored?.config_sha256)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        {initialBackups.summary.stored_count} backup(s) armazenado(s) ·{' '}
        {formatBytes(initialBackups.summary.total_stored_bytes)} no total
      </p>

      {initialBackups.items.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/50 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Recebido</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tamanho</th>
                <th className="px-4 py-3">Hash</th>
                <th className="px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {initialBackups.items.map((backup) => (
                <tr key={backup.id} className="bg-panel-soft/30">
                  <td className="px-4 py-3">{formatDateTime(backup.received_at)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        backup.status === 'stored'
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }
                    >
                      {backupRowStatusLabel(backup.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatBytes(backup.size_bytes)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-cyan-200">
                    {shortSha256(backup.config_sha256)}
                  </td>
                  <td className="px-4 py-3">
                    {backup.status === 'stored' && canDownload ? (
                      <BackupDownloadButton
                        href={`/api/v1/nodes/${nodeId}/config-backups/${backup.id}/download`}
                        receivedAt={formatDateTime(backup.received_at)}
                        sizeLabel={formatBytes(backup.size_bytes)}
                      />
                    ) : backup.status === 'stored' ? (
                      <span className="text-xs text-slate-500">Somente superadmin</span>
                    ) : (
                      <span className="text-xs text-slate-500">Sem arquivo novo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-6 text-sm text-slate-400">
          Nenhum backup recebido deste firewall ainda.
        </div>
      )}
    </section>
  );
}
