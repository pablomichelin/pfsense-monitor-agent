import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import {
  rotateNodeSecretAction,
  setNodeMaintenanceAction,
  updateNodeAction,
} from '@/lib/admin';
import {
  ApiError,
  getNodeBootstrapCommand,
  getNodeDetails,
  getSession,
} from '@/lib/api';
import { ADMIN_ROLES, hasRole } from '@/lib/authz';
import {
  formatDateTime,
  formatMs,
  formatPercent,
  formatRelativeAge,
  formatUptime,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

const statusTone: Record<string, string> = {
  online: 'bg-signal-online',
  degraded: 'bg-signal-degraded',
  offline: 'bg-signal-offline',
  maintenance: 'bg-signal-maintenance',
  unknown: 'bg-signal-unknown',
};

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl text-white">{value}</p>
    </div>
  );
}

function BootstrapField({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all text-sm text-cyan-300 hover:text-cyan-200"
        >
          {value}
        </a>
      ) : (
        <p className="mt-2 break-all text-sm text-slate-200">{value}</p>
      )}
    </div>
  );
}

function CommandBlock({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 font-mono text-xs text-cyan-100">
      {value}
    </pre>
  );
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

function buildAuditHref(input: {
  action?: string;
  targetType?: string;
  targetId?: string;
}) {
  const params = new URLSearchParams();

  if (input.action) {
    params.set('action', input.action);
  }

  if (input.targetType) {
    params.set('target_type', input.targetType);
  }

  if (input.targetId) {
    params.set('target_id', input.targetId);
  }

  const query = params.toString();
  return query ? `/audit?${query}` : '/audit';
}

function buildBootstrapHref(input: {
  nodeId: string;
  nodeUid: string;
  releaseBaseUrl?: string;
  controllerUrl?: string;
}) {
  const params = new URLSearchParams({
    bucket: 'pending',
    search: input.nodeUid,
    node_id: input.nodeId,
  });

  if (input.releaseBaseUrl) {
    params.set('release_base_url', input.releaseBaseUrl);
  }

  if (input.controllerUrl) {
    params.set('controller_url', input.controllerUrl);
  }

  return `/bootstrap?${params.toString()}`;
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

export default async function NodeDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const created =
    typeof resolvedSearchParams.created === 'string' &&
    resolvedSearchParams.created === '1';
  const rekeyed =
    typeof resolvedSearchParams.rekey === 'string' &&
    resolvedSearchParams.rekey === '1';
  const rekeyError =
    typeof resolvedSearchParams.rekey_error === 'string'
      ? resolvedSearchParams.rekey_error
      : undefined;
  const maintenanceState =
    typeof resolvedSearchParams.maintenance === 'string'
      ? resolvedSearchParams.maintenance
      : undefined;
  const maintenanceError =
    typeof resolvedSearchParams.maintenance_error === 'string'
      ? resolvedSearchParams.maintenance_error
      : undefined;
  const updated =
    typeof resolvedSearchParams.updated === 'string' &&
    resolvedSearchParams.updated === '1';
  const updateError =
    typeof resolvedSearchParams.update_error === 'string'
      ? resolvedSearchParams.update_error
      : undefined;
  const releaseBaseUrl =
    typeof resolvedSearchParams.release_base_url === 'string'
      ? resolvedSearchParams.release_base_url.trim()
      : undefined;
  const controllerUrl =
    typeof resolvedSearchParams.controller_url === 'string'
      ? resolvedSearchParams.controller_url.trim()
      : undefined;

  try {
    const [response, bootstrap, session] = await Promise.all([
      getNodeDetails(id),
      getNodeBootstrapCommand(id, releaseBaseUrl, controllerUrl),
      getSession(),
    ]);
    const { node } = response;
    const canManageNode = hasRole(session.user.role, ADMIN_ROLES);
    const identityLabel = `${node.client.name} / ${node.site.name} / ${node.node_uid}`;
    const evidenceBlock = buildEvidenceBlock({
      nodeId: node.id,
      nodeUid: bootstrap.node.node_uid,
      hostname: node.hostname,
      pfsenseVersion: node.pfsense_version,
      releaseVersion: bootstrap.release.version,
      artifactUrl: bootstrap.release.artifact_url,
      checksumUrl: bootstrap.release.checksum_url,
      installerUrl: bootstrap.release.installer_url,
      releaseBaseUrl,
      controllerUrl,
      bootstrapCommand: bootstrap.command,
    });
    const testConnectionAuditHref = buildAuditHref({
      action: 'ingest.test_connection',
      targetType: 'node',
      targetId: node.id,
    });
    const nodeAuditHref = buildAuditHref({
      targetType: 'node',
      targetId: node.id,
    });
    const bootstrapHref = buildBootstrapHref({
      nodeId: node.id,
      nodeUid: bootstrap.node.node_uid,
      releaseBaseUrl,
      controllerUrl,
    });
    const pfSensePrecheckBlock = buildPfSensePrecheckBlock({
      controllerUrl: bootstrap.release.controller_url,
      installerUrl: bootstrap.release.installer_url,
      artifactUrl: bootstrap.release.artifact_url,
      checksumUrl: bootstrap.release.checksum_url,
    });

    return (
      <div className="space-y-6">
        {created ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Node criado com sucesso. Use a secao de bootstrap abaixo para instalar o agente.
          </div>
        ) : null}
        {rekeyed ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Secret do agente rotacionado. Reinstale ou reconfigure o agente com o novo bootstrap.
          </div>
        ) : null}
        {rekeyError ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Falha ao rotacionar secret: {rekeyError}
          </div>
        ) : null}
        {maintenanceState ? (
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
            Maintenance mode {maintenanceState === 'enabled' ? 'ativado' : 'desativado'} com sucesso.
          </div>
        ) : null}
        {maintenanceError ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Falha ao atualizar maintenance mode: {maintenanceError}
          </div>
        ) : null}
        {updated ? (
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
            Metadados do firewall atualizados com sucesso.
          </div>
        ) : null}
        {updateError ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Falha ao atualizar node: {updateError}
          </div>
        ) : null}

        <PageHero
          eyebrow="Detalhe do firewall"
          title={node.display_name ?? node.hostname}
          description={identityLabel}
          stats={[
            { label: 'Status', value: node.effective_status },
            { label: 'Ultimo heartbeat', value: formatRelativeAge(node.last_seen_at) },
            { label: 'pfSense', value: node.pfsense_version ?? '-', tone: node.pfsense_version_homologated ? 'success' : 'warning' },
            { label: 'Agente', value: node.agent_version ?? '-' },
          ]}
          aside={
            <div className="space-y-3">
              <div className="flex justify-end">
                <RealtimeRefresh
                  scope="node"
                  nodeId={node.id}
                  renderedAt={response.generated_at}
                />
              </div>
              <div className="flex justify-end">
                <Link
                  href="/nodes"
                  className="rounded-full border border-slate-700 bg-panel-soft px-4 py-2 text-sm text-cyan-200 transition hover:border-cyan-400/60 hover:text-white"
                >
                  Voltar para firewalls
                </Link>
              </div>
              <div className="flex justify-end">
                <span
                  className={`rounded-full border px-3 py-1 text-xs ${
                    node.pfsense_version_homologated
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  {node.pfsense_version_homologated
                    ? 'Versao pfSense homologada'
                    : 'Versao pfSense fora da matriz homologada'}
                </span>
              </div>
            </div>
          }
        />

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="glass-panel rounded-[2rem] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Telemetria recente
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Uptime"
                  value={formatUptime(node.latest_heartbeat?.uptime_seconds ?? null)}
                />
                <Metric
                  label="CPU"
                  value={formatPercent(node.latest_heartbeat?.cpu_percent ?? null)}
                />
                <Metric
                  label="Memoria"
                  value={formatPercent(node.latest_heartbeat?.memory_percent ?? null)}
                />
                <Metric
                  label="Disco"
                  value={formatPercent(node.latest_heartbeat?.disk_percent ?? null)}
                />
              </div>
            </div>

            <div className="glass-panel rounded-[2rem] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Servicos
              </p>
              <div className="mt-4 grid gap-3">
                {node.services.map((service) => (
                  <div
                    key={service.name}
                    className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-lg text-white">{service.name}</h3>
                      <span className="capitalize text-slate-300">{service.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {service.message ?? 'Sem mensagem adicional.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-panel rounded-[2rem] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Gateways
              </p>
              <div className="mt-4 space-y-3">
                {node.gateways.map((gateway) => (
                  <div
                    key={gateway.name}
                    className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-lg text-white">{gateway.name}</h3>
                      <span className="capitalize text-slate-300">{gateway.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Latencia {formatMs(gateway.latency_ms)} / Perda {formatPercent(gateway.loss_percent)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-[2rem] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Identidade e heartbeat
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>Hostname: {node.hostname}</p>
                <p>Management IP: {node.management_ip ?? '-'}</p>
                <p>WAN IP: {node.wan_ip ?? '-'}</p>
                <p>HA role: {node.ha_role ?? '-'}</p>
                <p>Ultimo envio: {formatDateTime(node.latest_heartbeat?.sent_at ?? null)}</p>
                <p>Ultimo recebimento: {formatDateTime(node.latest_heartbeat?.received_at ?? null)}</p>
                <p>Latencia: {formatMs(node.latest_heartbeat?.latency_ms ?? null)}</p>
                <p>Boot estimado: {formatDateTime(node.last_boot_at)}</p>
              </div>
              {canManageNode ? (
                <form action={setNodeMaintenanceAction} className="mt-4">
                  <input type="hidden" name="node_id" value={node.id} />
                  <input
                    type="hidden"
                    name="maintenance_mode"
                    value={node.maintenance_mode ? 'false' : 'true'}
                  />
                  <button
                    type="submit"
                    className={`rounded-2xl border px-4 py-3 text-sm transition ${
                      node.maintenance_mode
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/50'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/50'
                    }`}
                  >
                    {node.maintenance_mode
                      ? 'Desativar maintenance mode'
                      : 'Ativar maintenance mode'}
                  </button>
                </form>
              ) : (
                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4 text-sm text-slate-500">
                  Maintenance mode disponivel apenas para `admin` e `superadmin`.
                </div>
              )}
            </div>

            {canManageNode ? (
              <div className="glass-panel rounded-[2rem] p-5">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                  Edicao rapida
                </p>
                <form action={updateNodeAction} className="mt-4 space-y-3">
                  <input type="hidden" name="node_id" value={node.id} />
                  <input
                    type="text"
                    name="hostname"
                    defaultValue={node.hostname}
                    placeholder="Hostname"
                    className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    name="display_name"
                    defaultValue={node.display_name ?? ''}
                    placeholder="Nome exibido"
                    className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    name="management_ip"
                    defaultValue={node.management_ip ?? ''}
                    placeholder="Management IP"
                    className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    name="wan_ip"
                    defaultValue={node.wan_ip ?? ''}
                    placeholder="WAN IP"
                    className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    name="pfsense_version"
                    defaultValue={node.pfsense_version ?? ''}
                    placeholder="pfSense version"
                    className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    name="agent_version"
                    defaultValue={node.agent_version ?? ''}
                    placeholder="Agent version"
                    className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    name="ha_role"
                    defaultValue={node.ha_role ?? ''}
                    placeholder="HA role"
                    className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
                  >
                    Salvar metadados
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
            Alertas recentes
          </p>
          <div className="mt-4 space-y-3">
            {node.recent_alerts.length === 0 ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-200">
                Nenhum alerta recente para este node.
              </div>
            ) : (
              node.recent_alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-display text-lg text-white">{alert.title}</h3>
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
                      {alert.severity} / {alert.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{alert.description}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Aberto em {formatDateTime(alert.opened_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
            Bootstrap do agente
          </p>
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-200">Credencial ativa do agente</p>
                <p className="mt-1 text-sm text-slate-500">
                  Use `rekey` quando precisar invalidar o secret atual e emitir um novo bootstrap.
                </p>
              </div>
              {canManageNode ? (
                <form action={rotateNodeSecretAction}>
                  <input type="hidden" name="node_id" value={node.id} />
                  <button
                    type="submit"
                    className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 transition hover:border-amber-400/50"
                  >
                    Rotacionar secret
                  </button>
                </form>
              ) : (
                <span className="text-sm text-slate-500">somente leitura</span>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <BootstrapField label="Node UID" value={bootstrap.node.node_uid} />
              <BootstrapField label="Secret hint" value={bootstrap.bootstrap.secret_hint} />
              <BootstrapField label="Artefato" value={bootstrap.release.artifact_name} />
              <BootstrapField
                label="Release base URL"
                value={bootstrap.release.release_base_url ?? 'nao configurada'}
              />
              <BootstrapField
                label="Controller URL"
                value={bootstrap.release.controller_url}
              />
              {bootstrap.release.artifact_url ? (
                <BootstrapField
                  label="Artifact URL"
                  value={bootstrap.release.artifact_url}
                  href={bootstrap.release.artifact_url}
                />
              ) : null}
              {bootstrap.release.checksum_url ? (
                <BootstrapField
                  label="Checksum URL"
                  value={bootstrap.release.checksum_url}
                  href={bootstrap.release.checksum_url}
                />
              ) : null}
              {bootstrap.release.installer_url ? (
                <BootstrapField
                  label="Installer URL"
                  value={bootstrap.release.installer_url}
                  href={bootstrap.release.installer_url}
                />
              ) : null}
            </div>

            {canManageNode ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                  Override operacional
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Use `release_base_url` e `controller_url` temporarios para homologacao sem alterar a configuracao permanente da API.
                </p>
                <form className="mt-4 flex flex-col gap-3">
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
                      Aplicar override
                    </button>
                    <Link
                      href={`/nodes/${node.id}`}
                      className="rounded-2xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                    >
                      Limpar
                    </Link>
                  </div>
                </form>
                {releaseBaseUrl || controllerUrl ? (
                  <div className="mt-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
                    <p>Overrides ativos para esta visualizacao.</p>
                    <p>release_base_url: {releaseBaseUrl ?? 'padrao da API'}</p>
                    <p>controller_url: {controllerUrl ?? 'padrao do MVP'}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {bootstrap.command ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">
                  Comando one-shot para usar em `Diagnostics &gt; Command Prompt`.
                </p>
                <CommandBlock value={bootstrap.command} />
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                  <p>Passo sugerido:</p>
                  <p>
                    1. Acesse `Diagnostics &gt; Command Prompt` no pfSense.
                  </p>
                  <p>
                    2. Cole o comando acima e execute.
                  </p>
                  <p>
                    3. Valide com `test-connection` e confirme o heartbeat no painel.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                  Configure `AGENT_BOOTSTRAP_RELEASE_BASE_URL` na API para gerar o comando
                  completo automaticamente.
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                  <p>Fallback manual atual:</p>
                  <p>
                    1. Publique `install-from-release.sh` e o artefato versionado.
                  </p>
                  <p>
                    2. Reabra este detalhe com o `release_base_url` configurado na API.
                  </p>
                  <p>
                    3. Use o `node_uid` acima e o secret do bootstrap emitido no cadastro.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Pre-check da rodada
              </p>
              <p className="text-sm text-slate-400">
                Feche esta conferencia no painel antes de abrir o pfSense e executar o bootstrap.
              </p>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                <p>1. `node_uid`: `{bootstrap.node.node_uid}`.</p>
                <p>2. `secret_hint`: `{bootstrap.bootstrap.secret_hint}`.</p>
                <p>3. `pfSense`: `{node.pfsense_version ?? '-'}`.</p>
                <p>4. `artifact_url`: `{bootstrap.release.artifact_url ?? 'indisponivel'}`.</p>
                <p>5. `checksum_url`: `{bootstrap.release.checksum_url ?? 'indisponivel'}`.</p>
                <p>6. `installer_url`: `{bootstrap.release.installer_url ?? 'indisponivel'}`.</p>
                <p>
                  7. override `release_base_url`: `{releaseBaseUrl ?? 'nao usado nesta visualizacao'}`.
                </p>
                <p>
                  8. override `controller_url`: `{controllerUrl ?? 'nao usado nesta visualizacao'}`.
                </p>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
                <Link
                  href={bootstrapHref}
                  className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-center text-sm text-cyan-200 transition hover:border-cyan-400/50"
                >
                  Abrir preflight da rodada
                </Link>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Pre-check no pfSense
              </p>
              <p className="text-sm text-slate-400">
                Rode este bloco em `Diagnostics &gt; Command Prompt` antes do bootstrap para confirmar versao, DNS e saida HTTP/HTTPS da rodada.
              </p>
              <CommandBlock value={pfSensePrecheckBlock} />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                <p>Conferencia esperada:</p>
                <p>1. `cat /etc/version` apontando `pfSense CE 2.8.1`.</p>
                <p>2. `drill` resolvendo o host publico do controlador e da release.</p>
                <p>3. `fetch` sem erro para `healthz`, instalador, artefato e `.sha256`.</p>
                <p>4. janela operacional permitindo reiniciar apenas o servico do agente se necessario.</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                  Sinais esperados na execucao
                </p>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                  <p>1. download do `install-from-release.sh`.</p>
                  <p>2. download do `.tar.gz` versionado do agente.</p>
                  <p>3. validacao positiva de `SHA256`.</p>
                  <p>4. escrita da config em `/usr/local/etc/monitor-pfsense-agent.conf`.</p>
                  <p>5. instalacao dos arquivos em `/usr/local/libexec/monitor-pfsense-agent/`.</p>
                  <p>6. instalacao do servico em `/usr/local/etc/rc.d/monitor_pfsense_agent`.</p>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                  Se a execucao falhar
                </p>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                  <p>1. capture a saida completa do shell antes de fechar a janela.</p>
                  <p>2. classifique primeiro: DNS, TLS, download ou `SHA256 mismatch`.</p>
                  <p>3. nao improvise ajuste permanente fora dos scripts versionados.</p>
                  <p>4. registre a categoria no bloco `Classificacao inicial de falha` abaixo.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Verificacao pos-bootstrap
              </p>
              <p className="text-sm text-slate-400">
                Rode este bloco no pfSense logo apos a instalacao para fechar a homologacao local antes de voltar ao painel.
              </p>
              <CommandBlock value={bootstrap.verification.command_block} />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                <p>Conferencia esperada:</p>
                <p>1. `status` do servico sem erro.</p>
                <p>2. `test-connection` com sucesso.</p>
                <p>3. `heartbeat` manual aceito pelo controlador.</p>
                <p>4. log local sem falha de DNS, TLS, download ou autenticacao.</p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Evidencias da rodada
              </p>
              <p className="text-sm text-slate-400">
                Use este bloco como base para registrar a homologacao manual do bootstrap em campo.
              </p>
              <CommandBlock value={evidenceBlock} />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                <p>Minimo esperado:</p>
                <p>1. versao do pfSense e da release do agente.</p>
                <p>2. comando de bootstrap realmente usado.</p>
                <p>3. resultado do `test-connection` e do primeiro `heartbeat` manual.</p>
                <p>4. anotacao ou print do painel com o node em `online`.</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                  Criterios de aceite
                </p>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                  <p>1. bootstrap sem ajuste manual fora do fluxo versionado.</p>
                  <p>2. checksum do release validado.</p>
                  <p>3. servico permanece instalado apos restart.</p>
                  <p>4. `test-connection` funciona com a credencial real do node.</p>
                  <p>5. ao menos um `heartbeat` real chega ao controlador.</p>
                  <p>6. o painel reflete o node como `online`.</p>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                  Classificacao inicial de falha
                </p>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                  <p>1. conectividade ou DNS no pfSense.</p>
                  <p>2. problema de release ou checksum.</p>
                  <p>3. erro de instalacao do bootstrap.</p>
                  <p>4. erro de autenticacao HMAC.</p>
                  <p>5. erro de persistencia do servico `rc.d`.</p>
                  <p>6. divergencia entre detalhe do node e ambiente real.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Verificacao no controlador
              </p>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                <p>1. reabra este detalhe depois do `test-connection` e do primeiro `heartbeat`.</p>
                <p>2. confirme `agent_version`, `ultimo heartbeat` e status `online` neste node.</p>
                <p>3. confira dashboard e inventario com refresh refletindo o node atualizado.</p>
                <p>4. revise a trilha `ingest.test_connection` e os eventos do node na auditoria.</p>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
                <Link
                  href={testConnectionAuditHref}
                  className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-center text-sm text-cyan-200 transition hover:border-cyan-400/50"
                >
                  Abrir auditoria de test-connection
                </Link>
                <Link
                  href={nodeAuditHref}
                  className="rounded-2xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  Abrir auditoria do node
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-2xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  Abrir dashboard
                </Link>
                <Link
                  href="/nodes"
                  className="rounded-2xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  Abrir inventario
                </Link>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Fechamento da rodada
              </p>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                <p>Se a homologacao foi aprovada:</p>
                <p>1. atualize `LEITURA-INICIAL.md` com o resultado da rodada.</p>
                <p>2. revise o percentual do roadmap se a fase mudou.</p>
                <p>3. registre a versao homologada do agente e do pfSense.</p>
                <p>4. decida o proximo passo: endurecer bootstrap/agente ou avancar para a GUI nativa.</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                <p>Se a homologacao falhou:</p>
                <p>1. preserve a evidencia da saida do shell e do painel.</p>
                <p>2. registre a categoria no bloco `Classificacao inicial de falha`.</p>
                <p>3. corrija a causa no fluxo versionado antes de repetir a rodada.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
