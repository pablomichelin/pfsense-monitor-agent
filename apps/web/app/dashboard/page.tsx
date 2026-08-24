import Link from 'next/link';
import { DashboardKpiGrid } from '@/components/dashboard/dashboard-kpi-grid';
import { FleetVersionMatrix } from '@/components/dashboard/fleet-version-matrix';
import { HotZoneExpandableList } from '@/components/hot-zone-expandable-list';
import { PageHero } from '@/components/page-hero';
import { Alert, Card, PageSection } from '@/components/ui';
import { cn } from '@/lib/cn';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { getDashboardFleet, getNodesList, getSession } from '@/lib/api';
import { isClientRole } from '@/lib/client-profile';
import { RealtimeRefresh } from '@/components/realtime-refresh';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let fleet;
  let nodes;
  let session;

  try {
    [fleet, nodes, session] = await Promise.all([
      getDashboardFleet(),
      getNodesList({ sort_by: 'name', sort_order: 'asc', limit: 200 }),
      getSession(),
    ]);
  } catch (error) {
    handlePageApiError(error);
  }

  const isClientProfile = isClientRole(session.user.role);

  const attentionNodes = nodes.items
    .filter((node) => node.effective_status === 'offline' || node.effective_status === 'degraded')
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow={isClientProfile ? 'Portal do cliente' : 'Visão operacional'}
        title={isClientProfile ? 'Seus firewalls' : 'Resumo dos firewalls'}
        description={
          isClientProfile
            ? 'Acompanhe o status e a saúde básica dos firewalls da sua empresa.'
            : 'Veja rapidamente quantos firewalls estão online, precisam de atenção ou ainda aguardam instalação.'
        }
        aside={<RealtimeRefresh renderedAt={fleet.generated_at} />}
      />

      <PageSection
        title="Precisa de atenção"
        description="Firewalls offline ou degradados que exigem atenção agora. Os indicadores consolidados continuam logo abaixo."
        actions={
          <Link
            href="/nodes?status=offline"
            className={cn(
              'inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-fg',
            )}
          >
            Ver inventário
          </Link>
        }
      >
        {attentionNodes.length === 0 ? (
          <Alert variant="success">
            Nenhum firewall offline ou degradado no momento.
          </Alert>
        ) : (
          <HotZoneExpandableList
            nodes={attentionNodes.map((node) => ({
              id: node.id,
              display_name: node.display_name,
              hostname: node.hostname,
              open_alerts: node.open_alerts,
              last_seen_at: node.last_seen_at,
              effective_status: node.effective_status,
            }))}
          />
        )}
      </PageSection>

      <PageSection
        title="Saúde da frota"
        description={
          isClientProfile
            ? 'Resumo do status da sua frota monitorada.'
            : 'Totais consolidados de status, backup e package da frota.'
        }
      >
        <DashboardKpiGrid fleet={fleet} isClientProfile={isClientProfile} />
      </PageSection>

      <PageSection
        title="Versões e indicadores informativos"
        description="Distribuição de pfSense OS e package monitor no escopo atual."
      >
        <FleetVersionMatrix
          matrix={fleet.version_matrix}
          packageTargetVersion={fleet.compliance.package_target_version}
        />
      </PageSection>

      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="font-display text-lg font-semibold text-fg">
            Inventário completo
          </h2>
          <p className="text-sm text-slate-400">
            Consulte métricas, versões e status detalhado de todos os firewalls
            monitorados.
          </p>
        </div>
        <Link
          href="/nodes"
          className={cn(
            'inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-500 px-4 text-sm font-medium text-slate-950 transition hover:bg-cyan-400',
          )}
        >
          Abrir firewalls
        </Link>
      </Card>
    </div>
  );
}
