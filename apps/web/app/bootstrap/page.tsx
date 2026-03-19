import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdvancedSection } from '@/components/advanced-section';
import { CopyButton } from '@/components/copy-button';
import { PageHero } from '@/components/page-hero';
import {
  ApiError,
  getNodeBootstrapCommand,
  getNodesFilters,
  getNodesList,
} from '@/lib/api';
import { formatDateTime, formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

type BootstrapBucket = 'pending' | 'active' | 'blocked';
type HeartbeatMode = 'normal' | 'light';

function buildBootstrapHref(filters: {
  clientId?: string;
  siteId?: string;
  search?: string;
  bucket?: string;
  nodeId?: string;
  releaseBaseUrl?: string;
  controllerUrl?: string;
  heartbeatMode?: HeartbeatMode;
}) {
  const params = new URLSearchParams();

  if (filters.clientId) {
    params.set('client_id', filters.clientId);
  }

  if (filters.siteId) {
    params.set('site_id', filters.siteId);
  }

  if (filters.search) {
    params.set('search', filters.search);
  }

  if (filters.bucket) {
    params.set('bucket', filters.bucket);
  }

  if (filters.nodeId) {
    params.set('node_id', filters.nodeId);
  }

  if (filters.releaseBaseUrl) {
    params.set('release_base_url', filters.releaseBaseUrl);
  }

  if (filters.controllerUrl) {
    params.set('controller_url', filters.controllerUrl);
  }
  if (filters.heartbeatMode) {
    params.set('heartbeat_mode', filters.heartbeatMode);
  }

  const query = params.toString();
  return query ? `/bootstrap?${query}` : '/bootstrap';
}

function normalizeHeartbeatMode(value: string | string[] | undefined): HeartbeatMode {
  return value === 'light' ? 'light' : 'normal';
}

function getBootstrapBucket(node: {
  node_uid_status: string;
  agent_version: string | null;
}): BootstrapBucket {
  if (node.node_uid_status !== 'active') {
    return 'blocked';
  }

  if (node.agent_version) {
    return 'active';
  }

  return 'pending';
}

function BootstrapBadge({ bucket }: { bucket: BootstrapBucket }) {
  if (bucket === 'active') {
    return (
      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-200">
        agente ativo
      </span>
    );
  }

  if (bucket === 'blocked') {
    return (
      <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1 font-mono text-xs text-rose-200">
        bloqueado
      </span>
    );
  }

  return (
    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-xs text-amber-200">
      pronto p/ bootstrap
    </span>
  );
}

function CommandBlock({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 font-mono text-xs text-cyan-100">
      {value}
    </pre>
  );
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function extractHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function buildPfSensePrecheckBlock(input: {
  controllerUrl: string;
  installerUrl: string | null;
  artifactUrl: string | null;
  checksumUrl: string | null;
}) {
  const lines = [
    'cat /etc/version',
    '',
    '# teste de DNS para os destinos da rodada',
  ];

  const hostnames = [
    extractHostname(input.controllerUrl),
    extractHostname(input.installerUrl),
    extractHostname(input.artifactUrl),
    extractHostname(input.checksumUrl),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  if (hostnames.length > 0) {
    for (const hostname of hostnames) {
      lines.push(`drill ${hostname}`);
    }
  } else {
    lines.push('# hostnames indisponiveis nesta visualizacao');
  }

  lines.push('');
  lines.push('# teste de saida HTTP/HTTPS para os URLs efetivos da rodada');
  lines.push(`fetch -qo /tmp/monitor-controller-check.out '${input.controllerUrl}/healthz' || true`);

  if (input.installerUrl) {
    lines.push(`fetch -qo /tmp/monitor-installer-check.out '${input.installerUrl}' || true`);
  }

  if (input.artifactUrl) {
    lines.push(`fetch -qo /tmp/monitor-artifact-check.out '${input.artifactUrl}' || true`);
  }

  if (input.checksumUrl) {
    lines.push(`fetch -qo /tmp/monitor-checksum-check.out '${input.checksumUrl}' || true`);
  }

  return lines.join('\n');
}

function buildEvidenceBlock(input: {
  nodeId: string;
  nodeUid: string;
  hostname: string;
  pfsenseVersion: string | null;
  releaseVersion: string;
  artifactUrl: string | null;
  checksumUrl: string | null;
  installerUrl: string | null;
  releaseBaseUrl: string | undefined;
  controllerUrl: string | undefined;
  bootstrapCommand: string | null;
}) {
  const lines = [
    `data_registro: ${new Date().toISOString()}`,
    `node_id: ${input.nodeId}`,
    `node_uid: ${input.nodeUid}`,
    `hostname: ${input.hostname}`,
    `pfsense_version: ${input.pfsenseVersion ?? '-'}`,
    `agent_release_version: ${input.releaseVersion}`,
    `artifact_url: ${input.artifactUrl ?? '-'}`,
    `checksum_url: ${input.checksumUrl ?? '-'}`,
    `installer_url: ${input.installerUrl ?? '-'}`,
    `release_base_url_override: ${input.releaseBaseUrl ?? 'nao usado'}`,
    `controller_url_override: ${input.controllerUrl ?? 'nao usado'}`,
    'test_connection_resultado: [preencher apos a rodada]',
    'heartbeat_manual_resultado: [preencher apos a rodada]',
    'painel_online_evidencia: [preencher com print ou anotacao]',
    'comando_bootstrap_usado:',
    input.bootstrapCommand ?? '[indisponivel sem release_base_url configurada]',
  ];

  return lines.join('\n');
}

export default async function BootstrapPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const clientId = typeof params.client_id === 'string' ? params.client_id : undefined;
  const siteId = typeof params.site_id === 'string' ? params.site_id : undefined;
  const search = typeof params.search === 'string' ? params.search : undefined;
  const bucket = typeof params.bucket === 'string' ? params.bucket : undefined;
  const selectedNodeId = typeof params.node_id === 'string' ? params.node_id : undefined;
  const releaseBaseUrl =
    typeof params.release_base_url === 'string' ? params.release_base_url.trim() : undefined;
  const controllerUrl =
    typeof params.controller_url === 'string' ? params.controller_url.trim() : undefined;
  const heartbeatMode = normalizeHeartbeatMode(params.heartbeat_mode);
  let nodes;
  let filterOptions;
  let selectedBootstrap = null;

  try {
    [nodes, filterOptions] = await Promise.all([
      getNodesList({
        client_id: clientId,
        site_id: siteId,
        search,
        limit: 200,
      }),
      getNodesFilters(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }

  const items = nodes.items.map((node) => ({
    ...node,
    bootstrap_bucket: getBootstrapBucket(node),
  }));

  const filteredItems = bucket
    ? items.filter((node) => node.bootstrap_bucket === bucket)
    : items;

  const pending = filteredItems.filter((node) => node.bootstrap_bucket === 'pending');
  const active = filteredItems.filter((node) => node.bootstrap_bucket === 'active');
  const blocked = filteredItems.filter((node) => node.bootstrap_bucket === 'blocked');

  const sites = clientId
    ? filterOptions.sites.filter((site) => site.client_id === clientId)
    : filterOptions.sites;
  const hasActiveFilters = Boolean(clientId || siteId || search || bucket);
  const resultSummary =
    filteredItems.length === items.length
      ? `${filteredItems.length} firewalls no escopo atual`
      : `${filteredItems.length} de ${items.length} firewalls no escopo atual`;
  const selectedNode =
    items.find((node) => node.id === selectedNodeId) ??
    filteredItems.find((node) => node.bootstrap_bucket === 'pending') ??
    filteredItems[0] ??
    null;

  if (selectedNode) {
    try {
      selectedBootstrap = await getNodeBootstrapCommand(
        selectedNode.id,
        releaseBaseUrl,
        controllerUrl,
        heartbeatMode,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        redirect('/login');
      }

      throw error;
    }
  }

  const selectedNodeScopeHref = selectedNode
    ? buildBootstrapHref({
        clientId,
        siteId,
        search,
        bucket,
        nodeId: selectedNode.id,
        releaseBaseUrl,
        controllerUrl,
        heartbeatMode,
      })
    : null;
  const verifyBootstrapCommand = selectedNode
    ? [
        'BASE_URL="https://pfs-monitor.systemup.inf.br" \\',
        `  ./scripts/verify-bootstrap-release.sh ${shellQuote(selectedNode.id)}${
          releaseBaseUrl ? ` ${shellQuote(releaseBaseUrl)}` : ''
        }${controllerUrl ? ` ${shellQuote(controllerUrl)}` : ''}`,
      ].join('\n')
    : null;
  const pfSensePrecheckBlock = selectedBootstrap
    ? buildPfSensePrecheckBlock({
        controllerUrl: selectedBootstrap.release.controller_url,
        installerUrl: selectedBootstrap.release.installer_url,
        artifactUrl: selectedBootstrap.release.artifact_url,
        checksumUrl: selectedBootstrap.release.checksum_url,
      })
    : null;
  const evidenceBlock =
    selectedNode && selectedBootstrap
      ? buildEvidenceBlock({
          nodeId: selectedNode.id,
          nodeUid: selectedBootstrap.node.node_uid,
          hostname: selectedNode.hostname,
          pfsenseVersion: selectedNode.pfsense_version,
          releaseVersion: selectedBootstrap.release.version,
          artifactUrl: selectedBootstrap.release.artifact_url,
          checksumUrl: selectedBootstrap.release.checksum_url,
          installerUrl: selectedBootstrap.release.installer_url,
          releaseBaseUrl,
          controllerUrl,
          bootstrapCommand: selectedBootstrap.package_command ?? selectedBootstrap.command,
        })
      : null;
  const runBootstrapPreflightCommand = selectedNode
    ? [
        'BASE_URL="https://pfs-monitor.systemup.inf.br" \\',
        `  ./scripts/run-bootstrap-preflight.sh ${shellQuote(selectedNode.id)}${
          releaseBaseUrl ? ` ${shellQuote(releaseBaseUrl)}` : ''
        }${controllerUrl ? ` ${shellQuote(controllerUrl)}` : ''}`,
      ].join('\n')
    : null;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Instalacao"
        title="Instalar agente"
        description="Escolha um firewall e copie o comando de instalacao."
        stats={[
          { label: 'Prontos', value: String(pending.length), tone: pending.length > 0 ? 'warning' : 'default' },
          { label: 'Ativos', value: String(active.length), tone: active.length > 0 ? 'success' : 'default' },
          { label: 'Bloqueados', value: String(blocked.length), tone: blocked.length > 0 ? 'danger' : 'default' },
        ]}
      />

      <section className="glass-panel rounded-xl p-3">
        <form className="flex flex-wrap items-center gap-2">
          <select
            name="client_id"
            defaultValue={clientId ?? ''}
            className="rounded-lg h-9 border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200 outline-none"
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
            className="rounded-lg h-9 border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200 outline-none"
          >
            <option value="">Todos</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.client_name} — {site.name} ({site.node_count})
              </option>
            ))}
          </select>
          <select
            name="bucket"
            defaultValue={bucket ?? ''}
            className="rounded-lg h-9 border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200 outline-none"
          >
            <option value="">Todos</option>
            <option value="pending">Prontos</option>
            <option value="active">Ativos</option>
            <option value="blocked">Bloqueados</option>
          </select>
          <input
            type="search"
            name="search"
            defaultValue={search ?? ''}
            placeholder="Buscar"
            className="min-w-[10rem] flex-1 rounded-lg h-9 max-w-[16rem] border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button type="submit" className="rounded-lg h-9 bg-cyan-500 px-4 text-sm font-medium text-slate-950 transition hover:bg-cyan-300">
            Filtrar
          </button>
          <Link href="/bootstrap" className="rounded-lg h-9 border border-slate-600/80 px-4 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">
            Limpar
          </Link>
        </form>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="glass-panel rounded-xl p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Escolha o firewall</p>
          <h3 className="mt-1.5 font-display text-xl text-white">Preparar instalacao</h3>

          <form className="mt-4 space-y-3">
            <select
              name="node_id"
              defaultValue={selectedNode?.id ?? ''}
              className="w-full rounded-xl h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
            >
              <option value="">Selecione um firewall</option>
              {filteredItems.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.client.name} — {node.site.name} — {node.node_uid}
                </option>
              ))}
            </select>
            <input type="hidden" name="client_id" value={clientId ?? ''} />
            <input type="hidden" name="site_id" value={siteId ?? ''} />
            <input type="hidden" name="search" value={search ?? ''} />
            <input type="hidden" name="bucket" value={bucket ?? ''} />
            <AdvancedSection
              title="Overrides de homologacao"
              description="Release base URL e controller URL para ambientes alternativos. Use apenas quando necessario."
            >
              <div className="space-y-3">
                <input
                  type="text"
                  name="release_base_url"
                  defaultValue={releaseBaseUrl ?? ''}
                  placeholder="https://downloads.systemup.inf.br/monitor-pfsense"
                  className="w-full rounded-xl h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
                <input
                  type="text"
                  name="controller_url"
                  defaultValue={controllerUrl ?? ''}
                  placeholder="https://pfs-monitor.systemup.inf.br"
                  className="w-full rounded-xl h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
            </AdvancedSection>
            <div className="flex flex-col gap-3 lg:flex-row">
              <button
                type="submit"
                className="rounded-xl h-11 bg-cyan-500 px-5 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                Abrir
              </button>
              <Link
                href={buildBootstrapHref({ clientId, siteId, search, bucket, heartbeatMode })}
                className="rounded-xl h-11 border border-slate-600/80 px-5 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Limpar preflight
              </Link>
            </div>
          </form>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Instalacao</p>
          {selectedNode && verifyBootstrapCommand && runBootstrapPreflightCommand ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-300">
                <p>Firewall: {selectedNode.display_name ?? selectedNode.hostname}</p>
                <p>Local: {selectedNode.client.name} — {selectedNode.site.name}</p>
                <p>Ultimo contato: {formatRelativeAge(selectedNode.last_seen_at)}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Use este comando no pfSense.</p>
                {(selectedBootstrap?.package_command ?? selectedBootstrap?.command) ? (
                  <CommandBlock value={selectedBootstrap.package_command ?? selectedBootstrap.command ?? ''} />
                ) : (
                  <CommandBlock value={verifyBootstrapCommand} />
                )}
              </div>
              <div className="flex flex-col gap-3 lg:flex-row">
                <Link
                  href={`/nodes/${selectedNode.id}`}
                  className="rounded-xl h-11 border border-slate-600/80 px-5 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  Abrir firewall
                </Link>
                {selectedNodeScopeHref ? (
                  <Link
                    href={selectedNodeScopeHref}
                    className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-center text-sm text-cyan-200 transition hover:border-cyan-400/50"
                  >
                    Manter selecionado
                  </Link>
                ) : null}
              </div>
              <AdvancedSection
                title="Diagnostico e preflight"
                description="Comandos de verificacao e material tecnico para homologacao."
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-slate-400">Verificacao do release.</p>
                    <CommandBlock value={verifyBootstrapCommand} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-slate-400">Preflight completo local.</p>
                    <CommandBlock value={runBootstrapPreflightCommand} />
                  </div>
                </div>
              </AdvancedSection>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-6 text-sm text-slate-500">
              Nenhum firewall selecionado para preflight. Escolha um firewall no formulario ao lado.
            </div>
          )}
        </div>
      </section>

      {selectedNode && selectedBootstrap ? (
        <section className="grid gap-5 md:grid-cols-2">
          <div className="glass-panel rounded-xl p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Resumo</p>
            <h3 className="mt-1.5 font-display text-xl text-white">Firewall selecionado</h3>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-300">
                <p>UID: {selectedBootstrap.node.node_uid}</p>
                <p>Hostname: {selectedNode.hostname}</p>
                <p>pfSense: {selectedNode.pfsense_version ?? '-'}</p>
                <p>Bucket: {selectedNode.bootstrap_bucket}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-300">
                <p>Release: {selectedBootstrap.release.version}</p>
                <p>Artifact: {selectedBootstrap.release.artifact_name}</p>
                <p>Release URL: {selectedBootstrap.release.release_base_url ?? 'nao configurada'}</p>
                <p>Controller URL: {selectedBootstrap.release.controller_url}</p>
              </div>
            </div>

            {(selectedBootstrap.package_command ?? selectedBootstrap.command) ? (
              <div className="mt-4 space-y-4">
                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Modo do heartbeat no install</p>
                    <span className="text-xs text-slate-500">
                      Atual: <strong className="text-slate-300">{selectedBootstrap.heartbeat_mode}</strong>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={buildBootstrapHref({
                        clientId,
                        siteId,
                        search,
                        bucket,
                        nodeId: selectedNode.id,
                        releaseBaseUrl,
                        controllerUrl,
                        heartbeatMode: 'normal',
                      })}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        selectedBootstrap.heartbeat_mode === 'normal'
                          ? 'border border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                          : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Normal
                    </Link>
                    <Link
                      href={buildBootstrapHref({
                        clientId,
                        siteId,
                        search,
                        bucket,
                        nodeId: selectedNode.id,
                        releaseBaseUrl,
                        controllerUrl,
                        heartbeatMode: 'light',
                      })}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        selectedBootstrap.heartbeat_mode === 'light'
                          ? 'border border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                          : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Light
                    </Link>
                  </div>
                  <p className="text-sm text-slate-500">
                    <strong className="text-slate-300">Normal</strong> envia serviços e gateways em todo heartbeat.{' '}
                    <strong className="text-slate-300">Light</strong> envia só métricas e reaproveita o último estado conhecido.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Comando principal</p>
                    <CopyButton value={selectedBootstrap.package_command ?? selectedBootstrap.command ?? ''} />
                  </div>
                  <p className="text-sm text-slate-400">
                    Cole em <strong>Diagnostics &gt; Command Prompt</strong>. Retorna na hora; instalação em segundo plano.
                  </p>
                  <CommandBlock value={selectedBootstrap.package_command ?? selectedBootstrap.command ?? ''} />
                </div>
                <div className="space-y-2">
                  <p className="font-mono text-xs uppercase tracking-wider text-slate-500">Comandos de teste (pós-instalação)</p>
                  <p className="text-sm text-slate-400">Valide serviço, config, test-connection e heartbeat no pfSense.</p>
                  <CommandBlock value={selectedBootstrap.verification.command_block} />
                </div>
                {selectedBootstrap.uninstall_command ? (
                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-mono text-xs uppercase tracking-wider text-slate-400">Remover pacote (uninstall)</p>
                      <CopyButton value={selectedBootstrap.uninstall_command} />
                    </div>
                    <p className="text-sm text-slate-500">Cole no pfSense em Diagnostics &gt; Command Prompt para remover por completo o pacote SystemUp Monitor.</p>
                    <CommandBlock value={selectedBootstrap.uninstall_command} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                Release ainda nao pronta nesta visualizacao. Configure `release_base_url` para
                montar o comando completo antes de ir ao pfSense.
              </div>
            )}
          </div>

          <div className="space-y-6">
            <AdvancedSection
              title="Detalhes tecnicos da rodada"
              description="Pre-check no pfSense e bloco de evidencia para homologacao."
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm text-slate-400">Pre-check no pfSense</p>
                  {pfSensePrecheckBlock ? <CommandBlock value={pfSensePrecheckBlock} /> : null}
                </div>
                <div>
                  <p className="mb-2 text-sm text-slate-400">Evidencias</p>
                  {evidenceBlock ? <CommandBlock value={evidenceBlock} /> : null}
                </div>
              </div>
            </AdvancedSection>
          </div>
        </section>
      ) : null}

      <section className="glass-panel rounded-xl p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Escopo atual</p>
            <h3 className="mt-1 font-display text-lg text-white">{resultSummary}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {hasActiveFilters
                ? 'A lista abaixo respeita os filtros aplicados nesta tela.'
                : 'Nenhum filtro aplicado. A tela mostra todos os firewalls retornados pelo inventario.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={buildBootstrapHref({
                clientId,
                siteId,
                search,
                heartbeatMode,
              })}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                !bucket
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              Todos
            </Link>
            <Link
              href={buildBootstrapHref({
                clientId,
                siteId,
                search,
                bucket: 'pending',
                heartbeatMode,
              })}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                bucket === 'pending'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              Prontos
            </Link>
            <Link
              href={buildBootstrapHref({
                clientId,
                siteId,
                search,
                bucket: 'active',
                heartbeatMode,
              })}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                bucket === 'active'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              Ativos
            </Link>
            <Link
              href={buildBootstrapHref({
                clientId,
                siteId,
                search,
                bucket: 'blocked',
                heartbeatMode,
              })}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                bucket === 'blocked'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              Bloqueados
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Fila de bootstrap</p>
                <h3 className="mt-1 font-display text-lg text-white">Firewalls prontos para instalar</h3>
              </div>
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-xs text-amber-200">
              {pending.length} pendentes
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {pending.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-200">
                Nenhum firewall aguardando bootstrap no momento.
              </div>
            ) : (
              pending.map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 transition hover:border-cyan-400/40"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h4 className="font-display text-lg text-white">
                        {node.display_name ?? node.hostname}
                      </h4>
                      <p className="mt-1 text-sm text-slate-400">
                        {node.client.name} — {node.site.name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {node.node_uid}
                      </p>
                    </div>
                    <div className="text-sm text-slate-400">
                      <p>Ultimo heartbeat: {formatRelativeAge(node.last_seen_at)}</p>
                      <p>{formatDateTime(node.last_seen_at)}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-xl p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Agentes ativos</p>
            <div className="mt-4 space-y-3">
              {active.slice(0, 6).map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 transition hover:border-cyan-400/40"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-display text-lg text-white">
                        {node.display_name ?? node.hostname}
                      </h4>
                      <p className="text-sm text-slate-500">
                        Agente {node.agent_version ?? '-'}
                      </p>
                    </div>
                    <BootstrapBadge bucket="active" />
                  </div>
                </Link>
              ))}
              {active.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-500">
                  Nenhum agente ativo ainda.
                </div>
              ) : null}
            </div>
          </div>

          <div className="glass-panel rounded-xl p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Bloqueios</p>
            <div className="mt-4 space-y-3">
              {blocked.slice(0, 6).map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 transition hover:border-rose-400/40"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-display text-lg text-white">
                        {node.display_name ?? node.hostname}
                      </h4>
                      <p className="text-sm text-slate-500">
                        node_uid_status {node.node_uid_status}
                      </p>
                    </div>
                    <BootstrapBadge bucket="blocked" />
                  </div>
                </Link>
              ))}
              {blocked.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-500">
                  Nenhum bloqueio de bootstrap no momento.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
