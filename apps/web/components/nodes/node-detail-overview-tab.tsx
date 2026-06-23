import { setNodeMaintenanceAction } from '@/lib/admin';
import type { NodeDetailsResponse, PfsenseUpgradeStatusResponse } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { parseIps, isPublicIp } from '@/lib/node-detail-helpers';
import { NodePfsenseUpgradeSection } from '@/components/node-pfsense-upgrade-section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';

type Node = NodeDetailsResponse['node'];

export function NodeDetailOverviewTab({
  node,
  canManageNode,
  canRunUpgrade,
  upgradeStatus,
}: {
  node: Node;
  canManageNode: boolean;
  canRunUpgrade: boolean;
  upgradeStatus: PfsenseUpgradeStatusResponse;
}) {
  type Iface = { name?: string; ip?: string; role?: string };
  const ifaces = (node.network_interfaces ?? []) as Iface[];
  const hasValidInterfaces =
    ifaces.length > 0 &&
    ifaces.some((iface) => ((iface?.name ?? '').trim() || (iface?.ip ?? '').trim()) !== '');
  const hasRole = ifaces.some((iface) => (iface?.role ?? '').trim() !== '');
  const wanIfaces = hasRole
    ? ifaces.filter(
        (i) =>
          ((i?.name ?? '').trim() || (i?.ip ?? '').trim()) !== '' &&
          (() => {
            const r = (i?.role ?? '').toLowerCase();
            const ip = (i?.ip ?? '').trim();
            if (r === 'wan') return true;
            if (r.startsWith('opt') && isPublicIp(ip)) return true;
            return false;
          })(),
      )
    : [];
  const internalIfaces = hasRole
    ? ifaces.filter(
        (i) =>
          ((i?.name ?? '').trim() || (i?.ip ?? '').trim()) !== '' &&
          (() => {
            const r = (i?.role ?? '').toLowerCase();
            const ip = (i?.ip ?? '').trim();
            if (r === 'lan') return true;
            if (r.startsWith('opt') && !isPublicIp(ip)) return true;
            return false;
          })(),
      )
    : [];
  const interfacesAllEmpty =
    ifaces.length > 0 &&
    ifaces.every((iface) => !(iface?.name ?? '').trim() && !(iface?.ip ?? '').trim());

  return (
    <PageSection
      title="Visão geral"
      description="Identidade do equipamento, interfaces de rede e modo de manutenção."
    >
      <Card>
        <div className="space-y-4 text-sm text-slate-300">
          <p>
            <span className="text-slate-500">Hostname:</span> {node.hostname}
          </p>
          <p>
            <span className="text-slate-500">Cliente:</span> {node.client.name}
          </p>
          <p>
            <span className="text-slate-500">Site:</span> {node.site.name}
          </p>
          <p>
            <span className="text-slate-500">UID:</span>{' '}
            <span className="font-mono text-slate-200">{node.node_uid}</span>
          </p>
          {hasValidInterfaces && hasRole && (internalIfaces.length > 0 || wanIfaces.length > 0) ? (
            <div className="space-y-3">
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="shrink-0 font-mono text-xs uppercase tracking-wider text-slate-500">WAN</span>
                {wanIfaces.length > 0 ? (
                  <span className="flex flex-wrap gap-2">
                    {wanIfaces.map((iface, i) => {
                      const name = (iface?.name ?? '').trim() || '—';
                      const ip = (iface?.ip ?? '').trim() || 'n/a';
                      return (
                        <span
                          key={`wan-${name}-${ip}-${i}`}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 font-mono text-xs text-slate-200"
                        >
                          <span className="font-semibold uppercase text-cyan-300/90">{name}</span>
                          <span className={ip === 'n/a' ? 'text-slate-500 italic' : ''}>{ip}</span>
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="shrink-0 font-mono text-xs uppercase tracking-wider text-slate-500">
                  Interfaces
                </span>
                {internalIfaces.length > 0 ? (
                  <span className="flex flex-wrap gap-2">
                    {internalIfaces.map((iface, i) => {
                      const name = (iface?.name ?? '').trim() || '—';
                      const ip = (iface?.ip ?? '').trim() || 'n/a';
                      return (
                        <span
                          key={`int-${name}-${ip}-${i}`}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 font-mono text-xs text-slate-200"
                        >
                          <span className="font-semibold uppercase text-cyan-300/90">{name}</span>
                          <span className={ip === 'n/a' ? 'text-slate-500 italic' : ''}>{ip}</span>
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </p>
            </div>
          ) : hasValidInterfaces ? (
            <div className="flex flex-wrap gap-2">
              {ifaces
                .filter((iface) => (iface?.name ?? '').trim() !== '' || (iface?.ip ?? '').trim() !== '')
                .map((iface, i) => {
                  const name = (iface?.name ?? '').trim() || '—';
                  const ip = (iface?.ip ?? '').trim() || 'n/a';
                  return (
                    <span
                      key={`${name}-${ip}-${i}`}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-1.5 font-mono text-xs text-slate-200"
                    >
                      <span className="font-semibold uppercase text-cyan-300/90">{name}</span>
                      <span className={ip === 'n/a' ? 'text-slate-500 italic' : ''}>{ip}</span>
                    </span>
                  );
                })}
            </div>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="shrink-0">IP(s) interno(s):</span>
                {parseIps(node.management_ip).length > 0 ? (
                  parseIps(node.management_ip).map((ip) => (
                    <span
                      key={ip}
                      className="inline-flex rounded-md border border-slate-600 bg-slate-800/80 px-2.5 py-0.5 font-mono text-xs text-slate-200"
                    >
                      {ip}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="shrink-0">IP(s) público(s) / WAN:</span>
                {parseIps(node.wan_ip).length > 0 ? (
                  parseIps(node.wan_ip).map((ip) => (
                    <span
                      key={ip}
                      className="inline-flex rounded-md border border-slate-600 bg-slate-800/80 px-2.5 py-0.5 font-mono text-xs text-slate-200"
                    >
                      {ip}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </p>
              {interfacesAllEmpty &&
                parseIps(node.management_ip).length === 0 &&
                parseIps(node.wan_ip).length === 0 && (
                  <p className="text-xs text-slate-500">
                    O agente enviou a lista de interfaces vazia. Para ver interfaces com nome (ADM, P4, etc.),
                    atualize o agente no firewall para a versão 0.2.20 ou superior e o painel para 0.1.20.
                  </p>
                )}
            </>
          )}
          <p>
            <span className="text-slate-500">Último contato:</span>{' '}
            {formatDateTime(node.latest_heartbeat?.received_at ?? null)}
          </p>
        </div>

        {canManageNode ? (
          <form action={setNodeMaintenanceAction} className="mt-6">
            <input type="hidden" name="node_id" value={node.id} />
            <input
              type="hidden"
              name="maintenance_mode"
              value={node.maintenance_mode ? 'false' : 'true'}
            />
            <Button
              type="submit"
              variant={node.maintenance_mode ? 'primary' : 'secondary'}
              size="sm"
            >
              {node.maintenance_mode ? 'Desativar maintenance mode' : 'Ativar maintenance mode'}
            </Button>
          </form>
        ) : (
          <Alert variant="info" className="mt-6">
            Maintenance mode disponível apenas para operadores com permissão de edição.
          </Alert>
        )}

        <NodePfsenseUpgradeSection
          nodeId={node.id}
          nodeEffectiveStatus={node.effective_status}
          canRunUpgrade={canRunUpgrade}
          initialStatus={upgradeStatus}
        />
      </Card>
    </PageSection>
  );
}
