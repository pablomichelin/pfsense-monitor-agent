import { redirect } from 'next/navigation';
import { BackupsFleetTable } from '@/components/backups/backups-fleet-table';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { Alert, Button, Card, PageSection } from '@/components/ui';
import {
  computeBackupFleetSummary,
  filterByBackupStatus,
  sortBackupFleetNodes,
  type BackupFleetNode,
} from '@/lib/backup-fleet-helpers';
import { ApiError, getNodesFilters, getNodesList, getSession } from '@/lib/api';
import { isClientRole } from '@/lib/client-profile';

export const dynamic = 'force-dynamic';

const listLimit = 500;

export default async function BackupsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const clientId = typeof params.client_id === 'string' ? params.client_id : undefined;
  const siteId = typeof params.site_id === 'string' ? params.site_id : undefined;
  const backupStatus =
    typeof params.backup_status === 'string' ? params.backup_status : undefined;
  const search = typeof params.search === 'string' ? params.search : undefined;
  const sortBy =
    typeof params.sort_by === 'string' &&
    ['name', 'backup_priority', 'backup_age'].includes(params.sort_by)
      ? (params.sort_by as 'name' | 'backup_priority' | 'backup_age')
      : 'backup_priority';
  const sortOrder =
    typeof params.sort_order === 'string' && ['asc', 'desc'].includes(params.sort_order)
      ? (params.sort_order as 'asc' | 'desc')
      : 'asc';

  let filterOptions;
  let nodes;
  let session;

  try {
    [filterOptions, nodes, session] = await Promise.all([
      getNodesFilters(),
      getNodesList({
        client_id: clientId,
        site_id: siteId,
        search,
        sort_by: 'name',
        sort_order: 'asc',
        limit: listLimit,
      }),
      getSession(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    if (error instanceof ApiError && error.status === 403) {
      redirect('/dashboard');
    }

    throw error;
  }

  const isClientProfile = isClientRole(session.user.role);
  const sites = clientId
    ? filterOptions.sites.filter((site) => site.client_id === clientId)
    : filterOptions.sites;

  const fleetNodes: BackupFleetNode[] = nodes.items.map((node) => ({
    id: node.id,
    hostname: node.hostname,
    display_name: node.display_name,
    client: node.client,
    site: node.site,
    backup_status: node.backup_status,
    latest_backup_received_at: node.latest_backup_received_at,
  }));

  const filteredNodes = filterByBackupStatus(fleetNodes, backupStatus);
  const sortedNodes = sortBackupFleetNodes(filteredNodes, sortBy, sortOrder);
  const summary = computeBackupFleetSummary(fleetNodes);

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Operação de backup"
        title="Backups da frota"
        description={
          isClientProfile
            ? 'Acompanhe o status de backup config.xml dos firewalls da sua empresa.'
            : 'Visão consolidada dos backups config.xml enviados pelos firewalls monitorados.'
        }
        stats={[
          {
            label: 'Em dia',
            value: String(summary.ok),
            tone: summary.ok > 0 ? 'success' : 'default',
          },
          {
            label: 'Atrasados',
            value: String(summary.late),
            tone: summary.late > 0 ? 'warning' : 'default',
          },
          {
            label: 'Falharam',
            value: String(summary.failed),
            tone: summary.failed > 0 ? 'danger' : 'default',
          },
          {
            label: 'Nunca enviado',
            value: String(summary.never),
            tone: summary.never > 0 ? 'default' : 'default',
          },
        ]}
        aside={<RealtimeRefresh renderedAt={nodes.generated_at} />}
      />

      <PageSection
        title="Filtros"
        description="Refine por cliente, site, status de backup ou busca textual."
      >
        <Card className="p-6">
          <form className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end xl:gap-4">
            <select
              name="client_id"
              defaultValue={clientId ?? ''}
              className="h-11 min-w-[11rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="">Todos os clientes</option>
              {filterOptions.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} ({client.node_count})
                </option>
              ))}
            </select>
            <select
              name="site_id"
              defaultValue={siteId ?? ''}
              className="h-11 min-w-[11rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="">Todos os sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.client_name} / {site.name} ({site.node_count})
                </option>
              ))}
            </select>
            <select
              name="backup_status"
              defaultValue={backupStatus ?? ''}
              className="h-11 min-w-[11rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="">Todos os status backup</option>
              <option value="ok">Em dia</option>
              <option value="late">Atrasado</option>
              <option value="failed">Falhou</option>
              <option value="never">Nunca enviado</option>
            </select>
            <input
              type="search"
              name="search"
              defaultValue={search ?? ''}
              placeholder="Buscar por nome, hostname ou cliente"
              className="h-11 min-w-[16rem] flex-1 rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <select
              name="sort_by"
              defaultValue={sortBy}
              className="h-11 min-w-[12rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="backup_priority">Ordenar: prioridade</option>
              <option value="backup_age">Ordenar: idade do backup</option>
              <option value="name">Ordenar: nome</option>
            </select>
            <select
              name="sort_order"
              defaultValue={sortOrder}
              className="h-11 min-w-[9rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
            <Button type="submit">Aplicar filtros</Button>
          </form>
        </Card>
      </PageSection>

      <PageSection
        title="Frota"
        description={
          isClientProfile
            ? 'Status de backup por firewall com atalho para o histórico completo.'
            : 'Listagem operacional com status, último envio e link para a aba Backup de cada firewall.'
        }
      >
        <Card className="overflow-hidden p-0">
          {sortedNodes.length === 0 ? (
            <Alert variant="info" className="m-6">
              Nenhum firewall encontrado com os filtros atuais.
            </Alert>
          ) : (
            <BackupsFleetTable nodes={sortedNodes} />
          )}
        </Card>
        {fleetNodes.length >= listLimit ? (
          <p className="mt-3 text-xs text-slate-500">
            Exibindo até {listLimit} firewalls. Refine os filtros para reduzir o volume.
          </p>
        ) : null}
      </PageSection>
    </div>
  );
}
