'use client';

import { useState, useTransition } from 'react';
import type { PfsenseAliasCompareResponse, PfsenseApiStatusResponse } from '@/lib/api';
import { comparePfsenseAliasesAction } from '@/lib/pfsense-capabilities-actions';
import { formatDateTime } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';

type Props = {
  nodeId: string;
  canViewAliases: boolean;
  status: PfsenseApiStatusResponse;
};

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'match') return 'success';
  if (status === 'different') return 'warning';
  if (status === 'only_api' || status === 'only_backup') return 'danger';
  return 'neutral';
}

export function NodePfsenseApiPanel({ nodeId, canViewAliases, status }: Props) {
  const [comparison, setComparison] = useState<PfsenseAliasCompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canViewAliases) {
    return null;
  }

  const loadComparison = () => {
    startTransition(async () => {
      try {
        const result = await comparePfsenseAliasesAction(nodeId);
        setComparison(result);
        setError(null);
      } catch (err) {
        setComparison(null);
        setError(err instanceof Error ? err.message : 'Falha ao comparar aliases');
      }
    });
  };

  return (
    <PageSection
      title="pfREST — Aliases (read-only)"
      description="Lista via pfREST e compara com o último config.xml armazenado. Apply piloto exige flags e backup recente."
    >
      <Card className="space-y-4 p-4 text-sm text-slate-300">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Integração</dt>
            <dd>{status.enabled ? 'Habilitada' : 'Desligada'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Read-only aliases</dt>
            <dd>{status.alias_read_enabled ? 'Sim' : 'Não'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Apply piloto</dt>
            <dd>{status.alias_apply_enabled ? 'Sim (lab)' : 'Desligado'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Backup exigido</dt>
            <dd>{status.require_recent_backup_hours}h</dd>
          </div>
        </dl>

        <Button type="button" disabled={pending || !status.alias_read_enabled} onClick={loadComparison}>
          Comparar aliases (pfREST × backup)
        </Button>

        {error ? <Alert variant="error">{error}</Alert> : null}

        {comparison ? (
          <div className="space-y-3">
            <p className="text-slate-500">
              Backup de referência:{' '}
              {comparison.backup_received_at
                ? formatDateTime(comparison.backup_received_at)
                : 'indisponível'}
              {' · '}
              {comparison.summary.match} ok · {comparison.summary.different} divergentes ·{' '}
              {comparison.summary.only_api} só API · {comparison.summary.only_backup} só backup
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-2 py-2">Alias</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">API</th>
                    <th className="px-2 py-2">Backup</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.items.map((item) => (
                    <tr key={item.name} className="border-b border-slate-800/70">
                      <td className="px-2 py-2 font-medium">{item.name}</td>
                      <td className="px-2 py-2">
                        <Badge variant={statusTone(item.status)}>{item.status}</Badge>
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-slate-400">
                        {item.api
                          ? `${item.api.type}: ${item.api.address.slice(0, 80)}`
                          : '—'}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-slate-400">
                        {item.backup
                          ? `${item.backup.type}: ${item.backup.address.slice(0, 80)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Card>
    </PageSection>
  );
}
