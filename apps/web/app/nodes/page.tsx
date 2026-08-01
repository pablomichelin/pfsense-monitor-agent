import { redirect } from 'next/navigation';
import { FleetInventorySection } from '@/components/nodes/fleet-inventory-section';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { Alert, Button, Card, PageSection } from '@/components/ui';
import type { StatusBadgeStatus } from '@/components/ui/status-badge';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { ApiError, getNodesFilters, getNodesList, getPackageRelease, getSession } from '@/lib/api';
import { isClientRole } from '@/lib/client-profile';
import { hasPermission } from '@/lib/authz';

export const dynamic = 'force-dynamic';

const effectiveStatusMap: Record<string, StatusBadgeStatus> = {
  online: 'online',
  degraded: 'degraded',
  offline: 'offline',
  maintenance: 'maintenance',
  unknown: 'unknown',
};

export default async function NodesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const clientId = typeof params.client_id === 'string' ? params.client_id : undefined;
  const siteId = typeof params.site_id === 'string' ? params.site_id : undefined;
  const status = typeof params.status === 'string' ? params.status : undefined;
  const tagId = typeof params.tag_id === 'string' ? params.tag_id : undefined;
  const groupId = typeof params.group_id === 'string' ? params.group_id : undefined;
  const criticality =
    typeof params.criticality === 'string' &&
    ['critical', 'standard', 'lab'].includes(params.criticality)
      ? (params.criticality as 'critical' | 'standard' | 'lab')
      : undefined;
  const search = typeof params.search === 'string' ? params.search : undefined;
  const sortBy =
    typeof params.sort_by === 'string' &&
    ['name', 'agent_version', 'version'].includes(params.sort_by)
      ? (params.sort_by as 'name' | 'agent_version' | 'version')
      : 'name';
  const sortOrder =
    typeof params.sort_order === 'string' && ['asc', 'desc'].includes(params.sort_order)
      ? (params.sort_order as 'asc' | 'desc')
      : 'asc';

  const listLimit = 200;
  let filterOptions;
  let nodes;
  let session;
  let targetPackageVersion: string | null = null;

  try {
    [filterOptions, nodes, session, targetPackageVersion] = await Promise.all([
      getNodesFilters(),
      getNodesList({
        client_id: clientId,
        site_id: siteId,
        status,
        tag_id: tagId,
        group_id: groupId,
        criticality,
        search,
        sort_by: sortBy,
        sort_order: sortOrder,
        limit: listLimit,
      }),
      getSession(),
      getPackageRelease()
        .then((release) => release.version)
        .catch(() => null),
    ]);
  } catch (error) {
    handlePageApiError(error);
  }

  const isClientProfile = isClientRole(session.user.role);
  const showAlertsColumn = !isClientProfile;
  const canRequestBackupBatch = hasPermission(session.permissions ?? [], 'backups.run');
  const canRunPackageUpgrade = hasPermission(
    session.permissions ?? [],
    'package.upgrade.run',
  );
  const canManageTechnicians = hasPermission(session.permissions ?? [], 'technicians.manage');
  const canResetTechnicianPassword = hasPermission(
    session.permissions ?? [],
    'technicians.password_reset.run',
  );

  const sites = clientId
    ? filterOptions.sites.filter((site) => site.client_id === clientId)
    : filterOptions.sites;

  const tags = clientId
    ? (filterOptions.tags ?? []).filter((tag) => tag.client_id === clientId)
    : (filterOptions.tags ?? []);

  const groups = clientId
    ? (filterOptions.groups ?? []).filter((group) => group.client_id === clientId)
    : (filterOptions.groups ?? []);

  const bootstrapSummary = nodes.items.reduce(
    (acc, node) => {
      if (node.node_uid_status !== 'active') {
        acc.blocked += 1;
      } else if (node.agent_version) {
        acc.active += 1;
      } else {
        acc.pending += 1;
      }

      return acc;
    },
    {
      active: 0,
      pending: 0,
      blocked: 0,
    },
  );

  const inventoryNodes = nodes.items.map((node) => ({
    id: node.id,
    hostname: node.hostname,
    display_name: node.display_name,
    client: node.client,
    site: node.site,
    effective_status: effectiveStatusMap[node.effective_status] ?? 'unknown',
    node_uid_status: node.node_uid_status,
    agent_version: node.agent_version,
    last_seen_at: node.last_seen_at,
    pfsense_version: node.pfsense_version,
    open_alerts: node.open_alerts,
    backup_status: node.backup_status,
    latest_backup_received_at: node.latest_backup_received_at,
    remote_access_url: node.remote_access_url,
    criticality: node.criticality,
    tags: node.tags,
  }));

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Inventário central"
        title="Firewalls monitorados"
        description="Lista principal de firewalls com status operacional, backup, alertas e etapa de instalação."
        stats={[
          {
            label: 'Itens exibidos',
            value: `${nodes.items.length}${nodes.items.length >= listLimit ? ' (máx.)' : ''}`,
          },
          {
            label: 'Agente ativo',
            value: String(bootstrapSummary.active),
            tone: bootstrapSummary.active > 0 ? 'success' : 'default',
          },
          {
            label: 'Bloqueados',
            value: String(bootstrapSummary.blocked),
            tone: bootstrapSummary.blocked > 0 ? 'danger' : 'default',
          },
        ]}
        aside={<RealtimeRefresh renderedAt={nodes.generated_at} />}
      />

      <PageSection
        title="Filtros"
        description="Refine por cliente, site, status ou busca textual. A ordenação afeta a listagem abaixo."
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
              name="status"
              defaultValue={status ?? ''}
              className="h-11 min-w-[10rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="">Todos os status</option>
              <option value="online">Online</option>
              <option value="degraded">Degradado</option>
              <option value="offline">Offline</option>
              <option value="maintenance">Manutenção</option>
              <option value="unknown">Desconhecido</option>
            </select>
            <select
              name="criticality"
              defaultValue={criticality ?? ''}
              className="h-11 min-w-[10rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="">Todas criticidades</option>
              <option value="critical">Crítico</option>
              <option value="standard">Padrão</option>
              <option value="lab">Lab</option>
            </select>
            <select
              name="tag_id"
              defaultValue={tagId ?? ''}
              className="h-11 min-w-[11rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="">Todas as tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.client_name} / {tag.name} ({tag.node_count})
                </option>
              ))}
            </select>
            <select
              name="group_id"
              defaultValue={groupId ?? ''}
              className="h-11 min-w-[11rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="">Todos os grupos</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.client_name} / {group.name} ({group.member_count})
                </option>
              ))}
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
              className="h-11 min-w-[10rem] rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="name">Ordenar: nome</option>
              <option value="agent_version">Ordenar: pacote</option>
              <option value="version">Ordenar: versão pfSense</option>
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

      {nodes.items.length === 0 ? (
        <PageSection title="Inventário">
          <Card className="overflow-hidden p-0">
            <Alert variant="info" className="m-6">
              Nenhum firewall encontrado com os filtros atuais.
            </Alert>
          </Card>
        </PageSection>
      ) : (
        <FleetInventorySection
          nodes={inventoryNodes}
          showAlertsColumn={showAlertsColumn}
          targetPackageVersion={targetPackageVersion}
          clientId={clientId}
          canRequestBackupBatch={canRequestBackupBatch}
          canRunPackageUpgrade={canRunPackageUpgrade}
          canManageTechnicians={canManageTechnicians}
          canResetTechnicianPassword={canResetTechnicianPassword}
        />
      )}
    </div>
  );
}
