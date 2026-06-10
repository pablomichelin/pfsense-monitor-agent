import type { NodeDetailsResponse } from '@/lib/api';
import { formatPercent, formatUptime } from '@/lib/format';
import {
  groupServicesByType,
  getServiceDisplayName,
  getServiceSubtitle,
} from '@/lib/node-detail-helpers';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';
import { Metric } from '@/components/nodes/node-detail-ui';

type Node = NodeDetailsResponse['node'];

export function NodeDetailMetricsTab({ node }: { node: Node }) {
  return (
    <div className="space-y-8">
      <PageSection
        title="Métricas"
        description="Último heartbeat recebido do agente neste firewall."
      >
        {node.latest_heartbeat ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Uptime"
              value={formatUptime(node.latest_heartbeat?.uptime_seconds ?? null)}
            />
            <Metric
              label="CPU"
              value={formatPercent(node.latest_heartbeat?.cpu_percent ?? null)}
            />
            <Metric
              label="Memória"
              value={formatPercent(node.latest_heartbeat?.memory_percent ?? null)}
            />
            <Metric
              label="Disco"
              value={formatPercent(node.latest_heartbeat?.disk_percent ?? null)}
            />
          </div>
        ) : (
          <Alert variant="info">Ainda não há dados recebidos deste firewall.</Alert>
        )}
      </PageSection>

      <PageSection title="Serviços" description="Estado reportado pelo agente (VPN e demais).">
        {node.services.length > 0 ? (
          <Card className="space-y-4">
            {groupServicesByType(node.services).map((group) => {
              const isVpn = ['openvpn', 'ipsec', 'wireguard'].includes(group.type);
              return (
                <div key={group.type}>
                  <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.services.map((service) => {
                      const ok = service.status === 'running';
                      const na = service.status === 'not_installed';
                      const dotClass = ok
                        ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                        : na
                          ? 'bg-slate-500'
                          : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]';
                      const title = isVpn
                        ? (getServiceSubtitle(service) ?? service.status)
                        : (service.message ?? service.status);
                      return (
                        <div
                          key={service.name}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-700/80 bg-slate-800/60 py-1.5 pl-2 pr-3"
                          title={title}
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
                          <span className="max-w-[12rem] truncate text-sm text-slate-200">
                            {getServiceDisplayName(service)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </Card>
        ) : (
          <Alert variant="info">Nenhum serviço reportado ainda.</Alert>
        )}
      </PageSection>
    </div>
  );
}
