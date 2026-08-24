'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, StatusBadge, type StatusBadgeStatus } from '@/components/ui';
import { getNodeOpenAlertsAction, type NodeOpenAlert } from '@/lib/admin';
import { formatRelativeAge } from '@/lib/format';

type NodeItem = {
  id: string;
  display_name: string | null;
  hostname: string;
  open_alerts: number;
  last_seen_at: string | null;
  effective_status: string;
};

const severityLabels: Record<string, { label: string; variant: 'danger' | 'warning' | 'neutral' }> = {
  critical: { label: 'Crítico', variant: 'danger' },
  warning: { label: 'Aviso', variant: 'warning' },
};

function toStatusBadge(status: string): StatusBadgeStatus {
  if (
    status === 'online' ||
    status === 'offline' ||
    status === 'degraded' ||
    status === 'maintenance'
  ) {
    return status;
  }
  return 'offline';
}

export function HotZoneExpandableList({ nodes }: { nodes: NodeItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [alertsCache, setAlertsCache] = useState<Record<string, NodeOpenAlert[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const toggle = async (node: NodeItem) => {
    if (expandedId === node.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(node.id);
    if (alertsCache[node.id] === undefined && node.open_alerts > 0) {
      setLoadingId(node.id);
      try {
        const { alerts } = await getNodeOpenAlertsAction(node.id);
        setAlertsCache((prev) => ({ ...prev, [node.id]: alerts }));
      } catch {
        setAlertsCache((prev) => ({ ...prev, [node.id]: [] }));
      } finally {
        setLoadingId(null);
      }
    }
  };

  return (
    <div className="space-y-2">
      {nodes.map((node) => {
        const isExpanded = expandedId === node.id;
        const alerts = alertsCache[node.id];
        const isLoading = loadingId === node.id;

        return (
          <div
            key={node.id}
            className="overflow-hidden rounded-lg border border-slate-700/80 bg-panel-soft/70"
          >
            <button
              type="button"
              onClick={() => toggle(node)}
              className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition hover:bg-panel-soft"
            >
              <div className="flex min-w-0 items-center gap-3">
                <StatusBadge status={toStatusBadge(node.effective_status)} />
                <span className="truncate font-medium text-fg">
                  {node.display_name ?? node.hostname}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 text-sm text-slate-400">
                <span className="hidden sm:inline">
                  Último heartbeat: {formatRelativeAge(node.last_seen_at)}
                </span>
                <span>
                  Alertas:{' '}
                  <span className={node.open_alerts > 0 ? 'text-rose-300' : 'text-slate-500'}>
                    {node.open_alerts}
                  </span>
                </span>
                <Link
                  href={`/nodes/${node.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-md px-2 py-1 text-sm text-cyan-400 transition hover:bg-slate-900/40 hover:text-cyan-300"
                >
                  Abrir
                </Link>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-700/80 bg-slate-950/50 px-4 py-3">
                <p className="mb-2 text-xs text-slate-500 sm:hidden">
                  Último heartbeat: {formatRelativeAge(node.last_seen_at)}
                </p>
                {isLoading ? (
                  <p className="text-sm text-slate-500">Carregando alertas…</p>
                ) : node.open_alerts === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nenhum alerta aberto para este firewall.
                  </p>
                ) : alerts && alerts.length > 0 ? (
                  <ul className="space-y-2">
                    {alerts.map((alert) => {
                      const severity = severityLabels[alert.severity] ?? {
                        label: alert.severity,
                        variant: 'neutral' as const,
                      };

                      return (
                        <li
                          key={alert.id}
                          className="flex flex-wrap items-start gap-2 rounded border border-slate-700/60 bg-panel-soft/50 px-3 py-2 text-sm"
                        >
                          <Badge variant={severity.variant} className="shrink-0">
                            {severity.label}
                          </Badge>
                          <span className="text-slate-200">{alert.title}</span>
                          <span className="text-xs text-slate-500">
                            {formatRelativeAge(alert.opened_at)}
                          </span>
                          <Link
                            href={`/nodes/${node.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="ml-auto text-xs text-cyan-400 hover:text-cyan-300"
                          >
                            Ver firewall
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">
                    Nenhum alerta aberto para este firewall.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
