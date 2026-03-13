import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import {
  ApiError,
  getNodeBootstrapCommand,
  getNodesFilters,
  getNodesList,
} from '@/lib/api';
import { formatDateTime, formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

type BootstrapBucket = 'pending' | 'active' | 'blocked';

function buildBootstrapHref(filters: {
  clientId?: string;
  siteId?: string;
  search?: string;
  bucket?: string;
  nodeId?: string;
  releaseBaseUrl?: string;
  controllerUrl?: string;
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

  const query = params.toString();
  return query ? `/bootstrap?${query}` : '/bootstrap';
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
      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-200">
        agente ativo
      </span>
    );
  }

  if (bucket === 'blocked') {
    return (
      <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 font-mono text-xs text-rose-200">
        bloqueado
      </span>
    );
  }

  return (
    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-xs text-amber-200">
      pronto p/ bootstrap
    </span>
  );
}

function CommandBlock({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 font-mono text-xs text-cyan-100">
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
  let nodes;
  let filterOptions;
  let selectedBootstrap = null;

  try {
    [nodes, filterOptions] = await Promise.all([
      getNodesList({
        client_id: clientId,
        site_id: siteId,
        search,
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
      ? `${filteredItems.length} nodes no escopo atual`
      : `${filteredItems.length} de ${items.length} nodes no escopo atual`;
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
          bootstrapCommand: selectedBootstrap.command,
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
        eyebrow="Operacao de campo"
        title="Bootstrap do agente"
        description="Concentra firewalls prontos para implantacao, os que ja estao com agente ativo e os casos bloqueados por estado de identidade."
        stats={[
          { label: 'Prontos', value: String(pending.length), tone: pending.length > 0 ? 'warning' : 'default' },
          { label: 'Ativos', value: String(active.length), tone: active.length > 0 ? 'success' : 'default' },
          { label: 'Bloqueados', value: String(blocked.length), tone: blocked.length > 0 ? 'danger' : 'default' },
        ]}
        aside={<RealtimeRefresh renderedAt={nodes.generated_at} />}
      />

      <section className="glass-panel rounded-[2rem] p-5">
        <form className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
              <select
                name="client_id"
                defaultValue={clientId ?? ''}
                className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
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
                className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="">Todos os sites</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.client_name} / {site.name} ({site.node_count})
                  </option>
                ))}
              </select>
              <select
                name="bucket"
                defaultValue={bucket ?? ''}
                className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="">Todos os buckets</option>
                <option value="pending">Prontos</option>
                <option value="active">Agentes ativos</option>
                <option value="blocked">Bloqueados</option>
              </select>
              <input
                type="search"
                name="search"
                defaultValue={search ?? ''}
                placeholder="Buscar por hostname, node UID ou cliente"
                className="min-w-[18rem] flex-1 rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                Filtrar
              </button>
              <Link
                href="/bootstrap"
                className="rounded-2xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Limpar
              </Link>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="glass-panel rounded-[2rem] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
            Preflight local
          </p>
          <h3 className="mt-2 font-display text-2xl text-white">
            Monte o comando antes de ir ao pfSense
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            Este bloco gera o `verify-bootstrap-release.sh` e o `run-bootstrap-preflight.sh`
            para o node alvo, com os mesmos overrides temporarios usados na homologacao.
          </p>

          <form className="mt-4 space-y-3">
            <select
              name="node_id"
              defaultValue={selectedNode?.id ?? ''}
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
            >
              <option value="">Selecione um node</option>
              {filteredItems.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.client.name} / {node.site.name} / {node.node_uid}
                </option>
              ))}
            </select>
            <input type="hidden" name="client_id" value={clientId ?? ''} />
            <input type="hidden" name="site_id" value={siteId ?? ''} />
            <input type="hidden" name="search" value={search ?? ''} />
            <input type="hidden" name="bucket" value={bucket ?? ''} />
            <input
              type="text"
              name="release_base_url"
              defaultValue={releaseBaseUrl ?? ''}
              placeholder="https://downloads.systemup.inf.br/monitor-pfsense"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              type="text"
              name="controller_url"
              defaultValue={controllerUrl ?? ''}
              placeholder="https://pfs-monitor.systemup.inf.br"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <div className="flex flex-col gap-3 lg:flex-row">
              <button
                type="submit"
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                Montar preflight
              </button>
              <Link
                href={buildBootstrapHref({ clientId, siteId, search, bucket })}
                className="rounded-2xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Limpar preflight
              </Link>
            </div>
          </form>
        </div>

        <div className="glass-panel rounded-[2rem] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
            Resultado do preflight
          </p>
          {selectedNode && verifyBootstrapCommand && runBootstrapPreflightCommand ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-300">
                <p>Node alvo: {selectedNode.node_uid}</p>
                <p>Cliente/Site: {selectedNode.client.name} / {selectedNode.site.name}</p>
                <p>Bucket atual: {selectedNode.bootstrap_bucket}</p>
                <p>Ultimo heartbeat: {formatRelativeAge(selectedNode.last_seen_at)}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-400">
                  Verificacao do comando, URLs e release publicados.
                </p>
                <CommandBlock value={verifyBootstrapCommand} />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-400">
                  Preflight completo local antes da rodada manual no firewall real.
                </p>
                <CommandBlock value={runBootstrapPreflightCommand} />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                <p>Requisitos:</p>
                <p>1. `AUTH_EMAIL` e `AUTH_PASSWORD` no ambiente ou em `.env.api`.</p>
                <p>2. stack do controlador respondendo em `BASE_URL`.</p>
                <p>3. release publicada com artefato, `.sha256` e `install-from-release.sh`.</p>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row">
                <Link
                  href={`/nodes/${selectedNode.id}`}
                  className="rounded-2xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  Abrir detalhe do node
                </Link>
                {selectedNodeScopeHref ? (
                  <Link
                    href={selectedNodeScopeHref}
                    className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-center text-sm text-cyan-200 transition hover:border-cyan-400/50"
                  >
                    Manter este node no preflight
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-6 text-sm text-slate-500">
              Nenhum node selecionado para preflight. Escolha um node no formulario ao lado.
            </div>
          )}
        </div>
      </section>

      {selectedNode && selectedBootstrap ? (
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-panel rounded-[2rem] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
              Rodada manual
            </p>
            <h3 className="mt-2 font-display text-2xl text-white">
              Pacote operacional do node selecionado
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              A tela abaixo usa o mesmo `bootstrap-command` emitido pelo backend e concentra o
              pre-check no pfSense, a validacao pos-instalacao e o bloco de evidencias.
            </p>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-300">
                <p>Node UID: {selectedBootstrap.node.node_uid}</p>
                <p>Hostname: {selectedNode.hostname}</p>
                <p>pfSense: {selectedNode.pfsense_version ?? '-'}</p>
                <p>Bucket: {selectedNode.bootstrap_bucket}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-300">
                <p>Release: {selectedBootstrap.release.version}</p>
                <p>Artifact: {selectedBootstrap.release.artifact_name}</p>
                <p>Release URL: {selectedBootstrap.release.release_base_url ?? 'nao configurada'}</p>
                <p>Controller URL: {selectedBootstrap.release.controller_url}</p>
              </div>
            </div>

            {selectedBootstrap.command ? (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-slate-400">
                    Comando one-shot para colar em `Diagnostics &gt; Command Prompt`.
                  </p>
                  <CommandBlock value={selectedBootstrap.command} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-slate-400">
                    Verificacao pos-bootstrap recomendada pelo backend.
                  </p>
                  <CommandBlock value={selectedBootstrap.verification.command_block} />
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                Release ainda nao pronta nesta visualizacao. Configure `release_base_url` para
                montar o comando completo antes de ir ao pfSense.
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="glass-panel rounded-[2rem] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Pre-check no pfSense
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Rode este bloco no firewall antes do bootstrap para validar versao, DNS e saida
                HTTP/HTTPS.
              </p>
              {pfSensePrecheckBlock ? <CommandBlock value={pfSensePrecheckBlock} /> : null}
            </div>

            <div className="glass-panel rounded-[2rem] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Evidencias da rodada
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Preencha e preserve este bloco ao fechar a homologacao manual.
              </p>
              {evidenceBlock ? <CommandBlock value={evidenceBlock} /> : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="glass-panel rounded-[2rem] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
              Escopo atual
            </p>
            <h3 className="mt-2 font-display text-2xl text-white">{resultSummary}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {hasActiveFilters
                ? 'A lista abaixo respeita os filtros aplicados nesta tela.'
                : 'Nenhum filtro aplicado. A tela mostra todos os nodes retornados pelo inventario.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={buildBootstrapHref({
                clientId,
                siteId,
                search,
              })}
              className={`rounded-full border px-4 py-2 text-sm transition ${
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
              })}
              className={`rounded-full border px-4 py-2 text-sm transition ${
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
              })}
              className={`rounded-full border px-4 py-2 text-sm transition ${
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
              })}
              className={`rounded-full border px-4 py-2 text-sm transition ${
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

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Prontos
          </p>
          <div className="mt-3 flex items-end justify-between">
            <span className="font-display text-4xl font-semibold text-white">
              {pending.length}
            </span>
            <BootstrapBadge bucket="pending" />
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Ativos
          </p>
          <div className="mt-3 flex items-end justify-between">
            <span className="font-display text-4xl font-semibold text-white">
              {active.length}
            </span>
            <BootstrapBadge bucket="active" />
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Bloqueados
          </p>
          <div className="mt-3 flex items-end justify-between">
            <span className="font-display text-4xl font-semibold text-white">
              {blocked.length}
            </span>
            <BootstrapBadge bucket="blocked" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-panel rounded-[2rem] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Fila de bootstrap
              </p>
              <h3 className="mt-2 font-display text-2xl text-white">
                Firewalls prontos para instalar
              </h3>
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-xs text-amber-200">
              {pending.length} pendentes
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {pending.length === 0 ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-200">
                Nenhum firewall aguardando bootstrap no momento.
              </div>
            ) : (
              pending.map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4 transition hover:border-cyan-400/40"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h4 className="font-display text-lg text-white">
                        {node.display_name ?? node.hostname}
                      </h4>
                      <p className="mt-1 text-sm text-slate-400">
                        {node.client.name} / {node.site.name}
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
          <div className="glass-panel rounded-[2rem] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
              Agentes ativos
            </p>
            <div className="mt-4 space-y-3">
              {active.slice(0, 6).map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4 transition hover:border-cyan-400/40"
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
                <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-500">
                  Nenhum agente ativo ainda.
                </div>
              ) : null}
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
              Bloqueios
            </p>
            <div className="mt-4 space-y-3">
              {blocked.slice(0, 6).map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4 transition hover:border-rose-400/40"
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
                <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-500">
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
