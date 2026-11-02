import { NodePagination } from '@/components/node-pagination';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdvancedSection } from '@/components/advanced-section';
import { CopyButton } from '@/components/copy-button';
import { InstallationBadge } from '@/components/nodes/installation-badge';
import { PageHero } from '@/components/page-hero';
import { Alert, Badge, Button, Card, PageSection } from '@/components/ui';
import {
  formInputClassName,
  formSelectClassName,
} from '@/lib/form-field-styles';
import {
  ApiError,
  getNodeBootstrapCommand,
  getNodesFilters,
  getNodesList,
  getSession,
} from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { formatDateTime, formatRelativeAge } from '@/lib/format';
import { buildBootstrapHref, buildPfSensePrecheckBlock, buildBootstrapEvidenceBlock, shellQuote } from '@/lib/bootstrap-command-helpers';

export const dynamic = 'force-dynamic';

type BootstrapBucket = 'pending' | 'active' | 'blocked';
type HeartbeatMode = 'normal' | 'light';

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

function bucketBadge(bucket: BootstrapBucket) {
  if (bucket === 'active') {
    return <Badge variant="success">Agente instalado</Badge>;
  }
  if (bucket === 'blocked') {
    return <Badge variant="danger">Bloqueado</Badge>;
  }
  return <Badge variant="warning">Pronto p/ bootstrap</Badge>;
}

const secondaryLinkClassName =
  'inline-flex h-11 min-h-11 items-center justify-center rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-fg';

function CommandBlock({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 font-mono text-xs text-cyan-100">
      {value}
    </pre>
  );
}

export default async function BootstrapPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
  const clientId = typeof params.client_id === 'string' ? params.client_id : undefined;
  const siteId = typeof params.site_id === 'string' ? params.site_id : undefined;
  const search = typeof params.search === 'string' ? params.search : undefined;
  const bucket: BootstrapBucket | undefined = typeof params.bucket === 'string' && ['pending', 'active', 'blocked'].includes(params.bucket) ? params.bucket as BootstrapBucket : undefined;
  const selectedNodeId = typeof params.node_id === 'string' ? params.node_id : undefined;
  const releaseBaseUrl =
    typeof params.release_base_url === 'string' ? params.release_base_url.trim() : undefined;
  const controllerUrl =
    typeof params.controller_url === 'string' ? params.controller_url.trim() : undefined;
  const heartbeatMode = normalizeHeartbeatMode(params.heartbeat_mode);
  let nodes;
  let filterOptions;
  let selectedBootstrap = null;
  let canExecuteBootstrap = false;
  let bootstrapError: string | null = null;

  try {
    const session = await getSession();
    if (!hasPermission(session.permissions ?? [], 'bootstrap.view')) {
      redirect('/conta?access=denied');
    }

    canExecuteBootstrap = hasPermission(session.permissions ?? [], 'bootstrap.execute');
    [nodes, filterOptions] = await Promise.all([
      getNodesList({
        client_id: clientId,
        site_id: siteId,
        search,
        bootstrap_bucket: bucket,
        limit: 50,
        cursor,
      }),
      getNodesFilters(),
    ]);
  } catch (error) {
    handlePageApiError(error);
  }

  const items = nodes.items.map((node) => ({
    ...node,
    bootstrap_bucket: getBootstrapBucket(node),
  }));

  const filteredItems = items;

  const pending = filteredItems.filter((node) => node.bootstrap_bucket === 'pending');
  const active = filteredItems.filter((node) => node.bootstrap_bucket === 'active');
  const blocked = filteredItems.filter((node) => node.bootstrap_bucket === 'blocked');
  const bootstrapSummary = nodes.bootstrap_summary;
  const counts = bootstrapSummary ?? { pending: pending.length, active: active.length, blocked: blocked.length };
  const countsContext = bootstrapSummary
    ? 'Nos filtros atuais — todos os estados'
    : 'Nesta página — resumo completo indisponível';

  const sites = clientId
    ? filterOptions.sites.filter((site) => site.client_id === clientId)
    : filterOptions.sites;
  const hasActiveFilters = Boolean(clientId || siteId || search || bucket);
  const resultSummary = `${items.length} firewalls nesta página de ${nodes.total} ${bucket ? 'no estado selecionado' : 'nos filtros atuais'}`;
  // An explicit selection must never silently fall back to another firewall.
  const selectedNode = selectedNodeId
    ? filteredItems.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const selectionMissing = Boolean(selectedNodeId && !selectedNode);

  if (selectedNode && canExecuteBootstrap) {
    try {
      selectedBootstrap = await getNodeBootstrapCommand(
        selectedNode.id,
        releaseBaseUrl,
        controllerUrl,
        heartbeatMode,
      );
    } catch (error) {
      if (error instanceof ApiError && [400, 403].includes(error.status)) {
        selectedBootstrap = null;
        bootstrapError = error.status === 403
          ? 'Sua permissão de instalação foi alterada. Solicite bootstrap.execute para revelar o comando.'
          : 'URL não aprovada. Use HTTPS e uma origem de release/controlador configurada pelo administrador.';
      } else {
        handlePageApiError(error);
      }
    }
  }

  const selectedNodeScopeHref = selectedNode
    ? buildBootstrapHref({
        cursor,
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
      ? buildBootstrapEvidenceBlock({
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
    <div className="space-y-section">
      <PageHero
        eyebrow="Instalação"
        title="Instalar agente"
        description={`Selecione explicitamente o firewall antes de gerar ou copiar o comando de instalação. Instalado indica registro anterior do agente; confira o último contato para saber se está comunicando. ${countsContext}.`}
        stats={[
          { label: bootstrapSummary ? 'Prontos' : 'Prontos na página', value: String(counts.pending), tone: counts.pending > 0 ? 'warning' : 'default' },
          { label: bootstrapSummary ? 'Instalados' : 'Instalados na página', value: String(counts.active), tone: counts.active > 0 ? 'success' : 'default' },
          { label: bootstrapSummary ? 'Bloqueados' : 'Bloqueados na página', value: String(counts.blocked), tone: counts.blocked > 0 ? 'danger' : 'default' },
        ]}
      />
      <p className="text-sm text-slate-400">{countsContext}{bootstrapSummary ? `: ${bootstrapSummary.total} firewalls.` : '.'}</p>

      <PageSection title="Filtros" description="Refine a lista de firewalls por cliente, local ou bucket.">
        <Card className="p-3">
        <form className="flex flex-wrap items-center gap-2">
          {releaseBaseUrl ? <input type="hidden" name="release_base_url" value={releaseBaseUrl} /> : null}
          {controllerUrl ? <input type="hidden" name="controller_url" value={controllerUrl} /> : null}
          <input type="hidden" name="heartbeat_mode" value={heartbeatMode} />
          <select
            name="client_id"
            defaultValue={clientId ?? ''}
            className={formSelectClassName}
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
            className={formSelectClassName}
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
            className={formSelectClassName}
          >
            <option value="">Todos</option>
            <option value="pending">Prontos</option>
            <option value="active">Instalados</option>
            <option value="blocked">Bloqueados</option>
          </select>
          <input
            type="search"
            name="search"
            defaultValue={search ?? ''}
            placeholder="Buscar"
            className={`${formInputClassName} min-w-[10rem] max-w-[16rem] flex-1`}
          />
          <Button type="submit">Filtrar</Button>
          <Link href="/bootstrap" className={secondaryLinkClassName}>
            Limpar
          </Link>
        </form>
        </Card>
      </PageSection>

      <NodePagination result={nodes} basePath="/bootstrap" params={{ client_id: clientId, site_id: siteId, search, bucket, release_base_url: releaseBaseUrl, controller_url: controllerUrl, heartbeat_mode: heartbeatMode }} />
      <section className="grid gap-5 md:grid-cols-2">
        <Card className="p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Escolha o firewall</p>
          <h3 className="mt-1.5 font-display text-xl text-fg">Preparar instalação</h3>

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
            <input type="hidden" name="cursor" value={cursor ?? ''} />
            <AdvancedSection
              title="Overrides de homologacao"
              description="Somente HTTPS e origens aprovadas na configuração do servidor. O comando oficial do package mantém o release publicado."
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
              <Button type="submit">Abrir</Button>
              <Link
                href={buildBootstrapHref({ clientId, siteId, search, bucket, heartbeatMode })}
                className={secondaryLinkClassName}
              >
                Limpar preflight
              </Link>
            </div>
          </form>
        </Card>

        <Card className="p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Instalação</p>
          {selectionMissing ? (
            <Alert variant="error">O firewall selecionado não está nesta página ou não pertence aos filtros atuais. Selecione novamente o firewall correto antes de copiar o comando.</Alert>
          ) : null}
          {selectedNode && verifyBootstrapCommand && runBootstrapPreflightCommand ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 text-sm text-slate-300">
                <p>Firewall: {selectedNode.display_name ?? selectedNode.hostname}</p>
                <p>Local: {selectedNode.client.name} — {selectedNode.site.name}</p>
                <p>Último contato: {formatRelativeAge(selectedNode.last_seen_at)}</p>
              </div>
              {selectedBootstrap?.package_command || selectedBootstrap?.command ? (
                <a href="#comando-instalacao" className={secondaryLinkClassName}>
                  Ver e copiar comando de instalação ↓
                </a>
              ) : (
                <Alert variant="warning">{!canExecuteBootstrap ? 'Você tem acesso somente à consulta. Revelar o comando e a credencial exige a permissão bootstrap.execute.' : bootstrapError ?? 'O comando de instalação não está disponível para este firewall. Consulte os diagnósticos ou revise a configuração do release.'}</Alert>
              )}
              <div className="flex flex-col gap-3 lg:flex-row">
                <Link href={`/nodes/${selectedNode.id}`} className={secondaryLinkClassName}>
                  Abrir firewall
                </Link>
                {selectedNodeScopeHref ? (
                  <Link
                    href={selectedNodeScopeHref}
                    className="inline-flex h-10 min-h-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/50"
                  >
                    Manter selecionado
                  </Link>
                ) : null}
              </div>
              <AdvancedSection
                title="Diagnóstico e preflight"
                description="Comandos de verificação e material técnico para homologação."
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-slate-400">Verificação do release.</p>
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
            <Alert variant="info" className="mt-4">
              Nenhum firewall selecionado. Escolha explicitamente um firewall no formulário ao lado para preparar a instalação.
            </Alert>
          )}
        </Card>
      </section>

      {selectedNode && selectedBootstrap ? (
        <section className="grid gap-5 md:grid-cols-2">
          <Card className="p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Resumo</p>
            <h3 className="mt-1.5 font-display text-xl text-fg">Firewall selecionado</h3>

            {releaseBaseUrl || controllerUrl ? <Alert variant="warning">Override solicitado. Confira abaixo os destinos efetivos antes de executar; o package usa o release oficial publicado.</Alert> : null}
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
                        cursor,
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
                        cursor,
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
                <div id="comando-instalacao" className="space-y-2 scroll-mt-6">
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
              <Alert variant="warning" className="mt-4">
                Release ainda não pronta nesta visualização. Configure `release_base_url` para
                montar o comando completo antes de ir ao pfSense.
              </Alert>
            )}
          </Card>

          <div className="space-y-section">
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
                  <p className="mb-2 text-sm text-slate-400">Evidência sanitizada — comandos e credenciais omitidos.</p>
                  {evidenceBlock ? <CommandBlock value={evidenceBlock} /> : null}
                </div>
              </div>
            </AdvancedSection>
          </div>
        </section>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Escopo atual</p>
            <h3 className="mt-1 font-display text-lg text-fg">{resultSummary}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {hasActiveFilters
                ? 'A lista abaixo respeita os filtros aplicados nesta tela.'
                : 'Nenhum filtro aplicado. A tela mostra todos os firewalls retornados pelo inventário.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={buildBootstrapHref({
                clientId,
                siteId,
                search,
                releaseBaseUrl,
                controllerUrl,
                heartbeatMode,
              })}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                !bucket
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-fg'
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
                releaseBaseUrl,
                controllerUrl,
                heartbeatMode,
              })}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                bucket === 'pending'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-fg'
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
                releaseBaseUrl,
                controllerUrl,
                heartbeatMode,
              })}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                bucket === 'active'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-fg'
              }`}
            >
              Instalados
            </Link>
            <Link
              href={buildBootstrapHref({
                clientId,
                siteId,
                search,
                bucket: 'blocked',
                releaseBaseUrl,
                controllerUrl,
                heartbeatMode,
              })}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                bucket === 'blocked'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-fg'
              }`}
            >
              Bloqueados
            </Link>
          </div>
        </div>
      </Card>

      <section className="grid gap-5 md:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Fila de bootstrap</p>
                <h3 className="mt-1 font-display text-lg text-fg">Firewalls prontos para instalar</h3>
              </div>
            <Badge variant="warning">{pending.length} pendentes nesta página</Badge>
          </div>

          <div className="mt-4 space-y-3">
            {pending.length === 0 ? (
              <Alert variant="info">Nenhum firewall pronto para bootstrap nesta página. Consulte outras páginas antes de concluir que não há pendências.</Alert>
            ) : (
              pending.map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 transition hover:border-cyan-400/40"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h4 className="font-display text-lg text-fg">
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
                      <p>Último heartbeat: {formatRelativeAge(node.last_seen_at)}</p>
                      <p>{formatDateTime(node.last_seen_at)}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-section">
          <Card className="p-4">
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-300">Agentes instalados</p>
            <div className="mt-4 space-y-3">
              {active.slice(0, 6).map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4 transition hover:border-cyan-400/40"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-display text-lg text-fg">
                        {node.display_name ?? node.hostname}
                      </h4>
                      <p className="text-sm text-slate-500">
                        Agente {node.agent_version ?? '-'}
                      </p>
                    </div>
                    <InstallationBadge
                      nodeUidStatus={node.node_uid_status}
                      agentVersion={node.agent_version}
                    />
                  </div>
                </Link>
              ))}
              {active.length === 0 ? (
                <Alert variant="info">Nenhum agente instalado nesta página.</Alert>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
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
                      <h4 className="font-display text-lg text-fg">
                        {node.display_name ?? node.hostname}
                      </h4>
                      <p className="text-sm text-slate-500">
                        node_uid_status {node.node_uid_status}
                      </p>
                    </div>
                    {bucketBadge('blocked')}
                  </div>
                </Link>
              ))}
              {blocked.length === 0 ? (
                <Alert variant="info">Nenhum bloqueio de bootstrap no momento.</Alert>
              ) : null}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
