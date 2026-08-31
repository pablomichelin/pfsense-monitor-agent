import Link from 'next/link';
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
import { isInventorySortBy } from '@/lib/nodes-inventory-sort';

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
  const preset =
    typeof params.preset === 'string' &&
    ['problem', 'offline', 'degraded', 'backup-late', 'no-backup', 'package-outdated'].includes(params.preset)
      ? params.preset
      : undefined;
  const sortBy =
    typeof params.sort_by === 'string' && isInventorySortBy(params.sort_by)
      ? params.sort_by
      : 'name';
  const sortOrder =
    typeof params.sort_order === 'string' && ['asc', 'desc'].includes(params.sort_order)
      ? (params.sort_order as 'asc' | 'desc')
      : 'asc';
  const inventoryQueryParams: Record<string, string | undefined> = {
    client_id: clientId,
    site_id: siteId,
    status,
    tag_id: tagId,
    group_id: groupId,
    criticality,
    search,
    preset,
  };

  const listLimit = 1000;
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
        preset: preset || undefined,
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

  const displayedInventoryNodes = inventoryNodes.filter((node) => {
    if (!preset) return true;
    if (preset === 'offline') return node.effective_status === 'offline';
    if (preset === 'degraded') return node.effective_status === 'degraded';
    if (preset === 'backup-late') return node.backup_status === 'late' || node.backup_status === 'failed';
    if (preset === 'no-backup') return node.backup_status === 'never';
    if (preset === 'package-outdated') {
      return Boolean(targetPackageVersion && node.agent_version !== targetPackageVersion);
    }
    return (
      node.effective_status === 'offline' ||
      node.effective_status === 'degraded' ||
      node.open_alerts > 0 ||
      node.backup_status !== 'ok' ||
      Boolean(targetPackageVersion && node.agent_version !== targetPackageVersion)
    );
  });

  const statusFilterLabels: Record<string, string> = {
    online: 'Online',
    degraded: 'Degradado',
    offline: 'Offline',
    maintenance: 'Manutenção',
    unknown: 'Desconhecido',
  };
  const criticalityFilterLabels: Record<string, string> = {
    critical: 'Crítico',
    standard: 'Padrão',
    lab: 'Lab',
  };

  const activeFilterChips: string[] = [];
  if (clientId) {
    const clientName =
      filterOptions.clients.find((client) => client.id === clientId)?.name ?? 'Cliente';
    activeFilterChips.push(clientName);
  }
  if (siteId) {
    const site = sites.find((item) => item.id === siteId);
    activeFilterChips.push(site ? site.name : 'Site');
  }
  if (status) {
    activeFilterChips.push(statusFilterLabels[status] ?? status);
  }
  if (criticality) {
    activeFilterChips.push(criticalityFilterLabels[criticality] ?? criticality);
  }
  if (tagId) {
    const tag = tags.find((item) => item.id === tagId);
    activeFilterChips.push(tag ? tag.name : 'Tag');
  }
  if (groupId) {
    const group = groups.find((item) => item.id === groupId);
    activeFilterChips.push(group ? group.name : 'Grupo');
  }
  if (search) {
    activeFilterChips.push(`“${search.length > 24 ? `${search.slice(0, 24)}…` : search}”`);
  }
  if (preset) {
    const presetLabels: Record<string, string> = {
      problem: 'Com problema',
      offline: 'Offline',
      degraded: 'Degradados',
      'backup-late': 'Backup atrasado',
      'no-backup': 'Sem backup',
      'package-outdated': 'Package desatualizado',
    };
    activeFilterChips.push(presetLabels[preset]);
  }
  const hasActiveFilters = activeFilterChips.length > 0;
  const quickPresetHref = (value?: string) => {
    const query = new URLSearchParams();
    for (const [key, item] of Object.entries(inventoryQueryParams)) {
      if (item && key !== 'status' && key !== 'preset') query.set(key, item);
    }
    if (value) query.set('preset', value);
    const serialized = query.toString();
    return serialized ? `/nodes?${serialized}` : '/nodes';
  };
  const quickPresets = [
    { label: 'Todos', value: undefined },
    { label: 'Com problema', value: 'problem' },
    { label: 'Offline', value: 'offline' },
    { label: 'Degradados', value: 'degraded' },
    { label: 'Backup atrasado', value: 'backup-late' },
    { label: 'Sem backup', value: 'no-backup' },
    { label: 'Package desatualizado', value: 'package-outdated' },
  ].map((item) => ({
    ...item,
    href: quickPresetHref(item.value),
    active: item.value ? preset === item.value : !preset && !status,
  }));

  return (
    <div className="space-y-section">
      <PageHero
        eyebrow="Inventário central"
        title="Firewalls monitorados"
        description="Lista principal de firewalls com status operacional, backup, alertas e etapa de instalação."
        stats={[
          {
            label: 'Itens exibidos',
            value: `${displayedInventoryNodes.length}${nodes.items.length >= listLimit ? ' (máx.)' : ''}`,
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

      <div className="flex flex-wrap items-center gap-2" aria-label="Atalhos de inventário">
        <span className="mr-1 text-sm font-medium text-fg-muted">Atalhos:</span>
        {quickPresets.map((preset) => (
          <Link
            key={preset.label}
            href={preset.href}
            aria-current={preset.active ? 'page' : undefined}
            className={
              preset.active
                ? 'rounded-full border border-primary bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary'
                : 'rounded-full border border-border bg-surface-soft px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:border-primary/40 hover:text-fg'
            }
          >
            {preset.label}
          </Link>
        ))}
      </div>

      <form className="glass-panel flex flex-col gap-2 rounded-xl p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="min-w-[12rem] flex-1 text-sm text-fg-muted">
          Cliente
          <select
            name="client_id"
            defaultValue={clientId ?? ''}
            className="mt-1 h-11 w-full rounded-lg border border-border bg-surface-soft px-4 text-sm text-fg outline-none"
          >
            <option value="">Todos os clientes</option>
            {filterOptions.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} ({client.node_count})
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[10rem] flex-1 text-sm text-fg-muted">
          Status
          <select
            name="status"
            defaultValue={status ?? ''}
            className="mt-1 h-11 w-full rounded-lg border border-border bg-surface-soft px-4 text-sm text-fg outline-none"
          >
            <option value="">Todos os status</option>
            <option value="online">Online</option>
            <option value="degraded">Degradado</option>
            <option value="offline">Offline</option>
            <option value="maintenance">Manutenção</option>
            <option value="unknown">Desconhecido</option>
          </select>
        </label>
        <label className="min-w-[16rem] flex-[2] text-sm text-fg-muted">
          Buscar
          <input
            type="search"
            name="search"
            defaultValue={search ?? ''}
            placeholder="Nome, hostname ou cliente"
            className="mt-1 h-11 w-full rounded-lg border border-border bg-surface-soft px-4 text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
        </label>
        <input type="hidden" name="site_id" value={siteId ?? ''} />
        <input type="hidden" name="tag_id" value={tagId ?? ''} />
        <input type="hidden" name="group_id" value={groupId ?? ''} />
        <input type="hidden" name="criticality" value={criticality ?? ''} />
        <input type="hidden" name="sort_by" value={sortBy} />
        <input type="hidden" name="sort_order" value={sortOrder} />
        <Button type="submit">Filtrar</Button>
      </form>

      <details
        className="glass-panel rounded-xl"
        open={hasActiveFilters ? true : undefined}
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 text-sm text-slate-200 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-400/90">
            Mais filtros
          </span>
          <span className="font-medium text-fg">
            {hasActiveFilters
              ? `${activeFilterChips.length} ativo${activeFilterChips.length === 1 ? '' : 's'}`
              : 'Nenhum filtro ativo'}
          </span>
          {activeFilterChips.map((chip, index) => (
            <span
              key={`${index}-${chip}`}
              className="rounded-md border border-slate-600/80 bg-panel-soft px-2 py-0.5 font-mono text-xs text-slate-300"
            >
              {chip}
            </span>
          ))}
          <span className="ml-auto text-xs text-slate-500">
            {hasActiveFilters ? 'Filtros técnicos ativos' : 'Criticidade, tags, grupos e ordenação'}
          </span>
        </summary>
        <div className="border-t border-slate-800 px-4 py-4 sm:px-6">
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
              <option value="status">Ordenar: status</option>
              <option value="name">Ordenar: firewall</option>
              <option value="version">Ordenar: versão pfSense</option>
              <option value="agent_version">Ordenar: pacote</option>
              <option value="backup">Ordenar: backup</option>
              <option value="alerts">Ordenar: alertas</option>
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
        </div>
      </details>

      {displayedInventoryNodes.length === 0 ? (
        <PageSection title="Inventário">
          <Card className="overflow-hidden p-0">
            <Alert variant="info" className="m-6">
              Nenhum firewall encontrado com os filtros atuais.
            </Alert>
          </Card>
        </PageSection>
      ) : (
        <FleetInventorySection
          nodes={displayedInventoryNodes}
          showAlertsColumn={showAlertsColumn}
          targetPackageVersion={targetPackageVersion}
          clientId={clientId}
          sortBy={sortBy}
          sortOrder={sortOrder}
          queryParams={inventoryQueryParams}
          canRequestBackupBatch={canRequestBackupBatch}
          canRunPackageUpgrade={canRunPackageUpgrade}
          canManageTechnicians={canManageTechnicians}
          canResetTechnicianPassword={canResetTechnicianPassword}
        />
      )}
    </div>
  );
}
