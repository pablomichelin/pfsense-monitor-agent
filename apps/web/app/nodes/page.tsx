import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { ApiError, getNodesFilters, getNodesList } from '@/lib/api';
import { formatDateTime, formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

const statusTone: Record<string, string> = {
  online: 'bg-signal-online',
  degraded: 'bg-signal-degraded',
  offline: 'bg-signal-offline',
  maintenance: 'bg-signal-maintenance',
  unknown: 'bg-signal-unknown',
};

function BootstrapStatus({
  nodeUidStatus,
  agentVersion,
}: {
  nodeUidStatus: string;
  agentVersion: string | null;
}) {
  if (nodeUidStatus !== 'active') {
    return (
      <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 font-mono text-xs text-rose-200">
        bloqueado
      </span>
    );
  }

  if (agentVersion) {
    return (
      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-200">
        agente ativo
      </span>
    );
  }

  return (
    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs text-amber-200">
      pronto p/ bootstrap
    </span>
  );
}

function VersionBadge({
  version,
  homologated,
}: {
  version: string | null;
  homologated: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-cyan-200">{version ?? '-'}</p>
        <span
        className={`rounded-md border px-2.5 py-0.5 font-mono text-xs ${
          homologated
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        }`}
      >
        {homologated ? 'homologada' : 'fora da matriz'}
      </span>
    </div>
  );
}

export default async function NodesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const clientId = typeof params.client_id === 'string' ? params.client_id : undefined;
  const siteId = typeof params.site_id === 'string' ? params.site_id : undefined;
  const status = typeof params.status === 'string' ? params.status : undefined;
  const search = typeof params.search === 'string' ? params.search : undefined;
  let filterOptions;
  let nodes;

  try {
    [filterOptions, nodes] = await Promise.all([
      getNodesFilters(),
      getNodesList({
        client_id: clientId,
        site_id: siteId,
        status,
        search,
      }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }

  const sites = clientId
    ? filterOptions.sites.filter((site) => site.client_id === clientId)
    : filterOptions.sites;

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

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Inventario central"
        title="Firewalls monitorados"
        description="Lista principal de firewalls com status, versao e etapa de instalacao."
        stats={[
          { label: 'Itens filtrados', value: String(nodes.items.length) },
          { label: 'Agente ativo', value: String(bootstrapSummary.active), tone: bootstrapSummary.active > 0 ? 'success' : 'default' },
          { label: 'Bloqueados', value: String(bootstrapSummary.blocked), tone: bootstrapSummary.blocked > 0 ? 'danger' : 'default' },
        ]}
        aside={<RealtimeRefresh renderedAt={nodes.generated_at} />}
      />

      <section className="glass-panel rounded-xl p-6">
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
                <option value="degraded">Degraded</option>
                <option value="offline">Offline</option>
                <option value="maintenance">Maintenance</option>
                <option value="unknown">Unknown</option>
              </select>
              <input
                type="search"
                name="search"
                defaultValue={search ?? ''}
                placeholder="Buscar por nome, hostname ou cliente"
                className="h-11 min-w-[16rem] flex-1 rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="h-11 rounded-lg bg-cyan-500 px-5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
              >
                Aplicar filtros
              </button>
        </form>
      </section>

      <section className="glass-panel overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
              <tr>
                <th className="w-28 min-w-[7rem] px-4 py-4">Status</th>
                <th className="min-w-[10rem] px-4 py-4">Firewall</th>
                <th className="min-w-[8rem] px-4 py-4">Local</th>
                <th className="min-w-[8rem] px-4 py-4">Versao</th>
                <th className="min-w-[6rem] px-4 py-4">Ultimo contato</th>
                <th className="w-28 min-w-[7rem] px-4 py-4">Instalacao</th>
              </tr>
            </thead>
            <tbody>
              {nodes.items.map((node) => (
                <tr
                  key={node.id}
                  className="border-b border-slate-900/80 text-slate-200 transition hover:bg-slate-950/20"
                >
                  <td className="w-28 min-w-[7rem] px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className={`status-dot ${statusTone[node.effective_status]}`} />
                      <span className="capitalize">{node.effective_status}</span>
                    </div>
                  </td>
                  <td className="min-w-[10rem] px-4 py-4">
                    <Link href={`/nodes/${node.id}`} className="font-display text-lg text-white hover:text-cyan-200">
                      <span className="truncate block">{node.display_name ?? node.hostname}</span>
                    </Link>
                    <p className="mt-1 truncate text-xs text-slate-500">{node.hostname}</p>
                  </td>
                  <td className="min-w-[8rem] px-4 py-4">
                    <p className="truncate">{node.client.name}</p>
                    <p className="truncate text-slate-500">{node.site.name}</p>
                  </td>
                  <td className="min-w-[8rem] px-4 py-4">
                    <VersionBadge
                      version={node.pfsense_version}
                      homologated={node.pfsense_version_homologated}
                    />
                    <p className="text-slate-500">Agente {node.agent_version ?? 'nao instalado'}</p>
                  </td>
                  <td className="min-w-[6rem] px-4 py-4 text-slate-400">
                    <p>{formatRelativeAge(node.last_seen_at)}</p>
                  </td>
                  <td className="w-28 min-w-[7rem] px-4 py-4">
                    <div className="flex flex-col gap-2">
                      <BootstrapStatus
                        nodeUidStatus={node.node_uid_status}
                        agentVersion={node.agent_version}
                      />
                      <Link
                        href={`/nodes/${node.id}`}
                        className="text-xs text-cyan-300 transition hover:text-cyan-200"
                      >
                        Abrir
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {nodes.items.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Nenhum node encontrado com os filtros atuais.
          </div>
        ) : null}
      </section>
    </div>
  );
}
