'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import type { NodeCommandHistoryResponse } from '@/lib/api';
import {
  cancelNodeCommandAction,
  fetchNodeCommandHistory,
} from '@/lib/node-commands-actions';
import { formatDateTime, formatRelativeAge } from '@/lib/format';
import { useScopedRead } from '@/lib/use-scoped-read';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';
import {
  NodeCommandProgress,
  commandTypeLabel,
} from '@/components/nodes/node-command-progress';

type Props = {
  nodeId: string;
  initialHistory: NodeCommandHistoryResponse | null;
  unavailableSince?: string;
  canCancelBackup: boolean;
  canCancelPfsenseUpgrade: boolean;
  canCancelPackageUpgrade: boolean;
  canCancelServiceRestart: boolean;
  canCancelNodeReboot: boolean;
};

function canCancelCommand(
  type: string,
  permissions: {
    backup: boolean;
    pfsense: boolean;
    packageUpgrade: boolean;
    serviceRestart: boolean;
    nodeReboot: boolean;
  },
): boolean {
  switch (type) {
    case 'config_backup_now':
      return permissions.backup;
    case 'pfsense_upgrade':
      return permissions.pfsense;
    case 'package_upgrade':
      return permissions.packageUpgrade;
    case 'service_restart':
      return permissions.serviceRestart;
    case 'node_reboot':
      return permissions.nodeReboot;
    default:
      return false;
  }
}

export function NodeCommandHistoryPanel({
  nodeId,
  initialHistory,
  unavailableSince,
  canCancelBackup,
  canCancelPfsenseUpgrade,
  canCancelPackageUpgrade,
  canCancelServiceRestart,
  canCancelNodeReboot,
}: Props) {
  const [history, setHistory] = useState(initialHistory);
  const [confirmedCancellations, setConfirmedCancellations] = useState(() => new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [recoveredSnapshot, setRecoveredSnapshot] = useState<string>();
  const historyUnavailable = unavailableSince !== undefined && recoveredSnapshot !== unavailableSince;
  const readHistory = useScopedRead(nodeId, unavailableSince ?? initialHistory);

  // Next.js may stream a new server snapshot into the mounted client component.
  // Adopt it even when the previous snapshot contained no active commands.
  useEffect(() => {
    if (initialHistory) {
      setHistory(initialHistory);
      setError(null);
    }
  }, [initialHistory, nodeId]);

  const refresh = useCallback((afterCancellation = false) => readHistory(
    () => fetchNodeCommandHistory(nodeId),
    (next) => {
      setHistory(next);
      setError(null);
      setRecoveredSnapshot(unavailableSince);
    },
    (error) => setError(error instanceof Error ? error.message : 'Falha ao atualizar histórico'),
    afterCancellation,
  ), [nodeId, readHistory, unavailableSince]);

  const shouldRefresh = historyUnavailable || history?.items.some((item) => item.progress.is_active);

  useEffect(() => {
    if (!shouldRefresh) {
      return;
    }

    const timer = setInterval(() => {
      void refresh();
    }, 15_000);

    return () => clearInterval(timer);
  }, [shouldRefresh, refresh]);

  const items = (history?.items ?? []).map((item) => {
    if (!confirmedCancellations.has(item.command_id) || item.status === 'cancelled') {
      return item;
    }

    return {
      ...item,
      status: 'cancelled',
      completed_at: null,
      error_message: null,
      progress: { phase: 'terminal' as const, is_active: false, is_terminal: true },
    };
  });

  const cancelPermissions = {
    backup: canCancelBackup,
    pfsense: canCancelPfsenseUpgrade,
    packageUpgrade: canCancelPackageUpgrade,
    serviceRestart: canCancelServiceRestart,
    nodeReboot: canCancelNodeReboot,
  };

  return (
    <PageSection
      title="Comandos remotos"
      description="Histórico de comandos allowlistados enviados ao agente via heartbeat."
    >
      {error ? <Alert variant="error">{error}</Alert> : null}
      {historyUnavailable ? (
        <Alert variant="warning">Consulta do histórico indisponível. O painel tentará novamente.</Alert>
      ) : null}

      {history ? <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Solicitado</th>
              <th className="px-4 py-3 font-medium">Concluído</th>
              <th className="px-4 py-3 font-medium">Tentativas</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Nenhum comando registrado para este firewall.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.command_id} className="border-b border-slate-800/80">
                  <td className="px-4 py-3 text-slate-200">
                    {commandTypeLabel(item.type)}
                    {item.batch_id ? (
                      <span className="mt-1 block text-xs text-slate-500">
                        Lote {item.batch_id.slice(0, 8)}…
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <NodeCommandProgress
                      status={item.status}
                      phase={item.progress.phase}
                      isActive={item.progress.is_active}
                      compact
                    />
                    {item.error_message ? (
                      <p className="mt-1 max-w-xs truncate text-xs text-rose-300">
                        {item.error_message}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    <span title={formatDateTime(item.requested_at)}>
                      {formatRelativeAge(item.requested_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {item.completed_at
                      ? formatRelativeAge(item.completed_at)
                      : item.progress.is_active
                        ? '—'
                        : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {item.max_retries > 0
                      ? `${item.retry_count}/${item.max_retries}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.progress.is_active &&
                    canCancelCommand(item.type, cancelPermissions) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending || historyUnavailable}
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              const receipt = await cancelNodeCommandAction(nodeId, item.command_id);
                              if (receipt.status === 'cancelled' && receipt.command_id === item.command_id) {
                                setConfirmedCancellations((current) => new Set([...current, item.command_id]));
                              }
                              await refresh(true);
                            } catch (err) {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Falha ao cancelar comando',
                              );
                            }
                          });
                        }}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card> : null}
    </PageSection>
  );
}
