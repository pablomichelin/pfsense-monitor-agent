import Link from 'next/link';
import type { NodeTechnicianAccountItem } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  technicianAccountStatusBadgeVariant,
  technicianAccountStatusLabel,
} from '@/lib/technician-status';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';

export function NodeTechnicianAccountsPanel({
  items,
  canManageTechnicians,
}: {
  items: NodeTechnicianAccountItem[];
  canManageTechnicians: boolean;
}) {
  return (
    <PageSection
      title="Técnicos com acesso"
      description="Contas locais de técnicos cadastradas neste firewall (login por pessoa, sem senha compartilhada)."
    >
      <Card className={items.length > 0 ? 'overflow-x-auto' : undefined}>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma conta de técnico provisionada neste firewall ainda.
            {canManageTechnicians ? (
              <>
                {' '}
                Use a seção{' '}
                <Link href="/admin/tecnicos" className="text-cyan-400 hover:text-cyan-300">
                  Técnicos
                </Link>{' '}
                ou o painel de ações em lote em{' '}
                <Link href="/nodes" className="text-cyan-400 hover:text-cyan-300">
                  Firewalls
                </Link>{' '}
                para provisionar.
              </>
            ) : null}
          </p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-medium">Técnico</th>
                <th className="px-3 py-2 font-medium">Login pfSense</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Última sincronização</th>
                <th className="px-3 py-2 font-medium">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-800/70 text-slate-300 last:border-0">
                  <td className="px-3 py-3 align-top">
                    <p className="font-medium text-slate-200">{item.technician_full_name}</p>
                    {item.technician_status === 'revoked' ? (
                      <p className="mt-1 text-xs text-amber-300/90">Removido do cadastro central</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top font-mono text-xs text-slate-400">
                    {item.pfsense_username}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Badge variant={technicianAccountStatusBadgeVariant(item.status)}>
                      {technicianAccountStatusLabel(item.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 align-top whitespace-nowrap text-slate-400">
                    {formatDateTime(item.last_synced_at)}
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-slate-500">
                    {item.last_error ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageSection>
  );
}
