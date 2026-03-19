import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdvancedSection } from '@/components/advanced-section';
import { CopyButton } from '@/components/copy-button';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import {
  rotateNodeSecretAction,
  setNodeMaintenanceAction,
  updateNodeAction,
} from '@/lib/admin';
import { DeleteNodeButton } from '@/components/delete-node-button';
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

type HeartbeatMode = 'normal' | 'light';

const statusTone: Record<string, string> = {
  online: 'bg-signal-online',
  degraded: 'bg-signal-degraded',
  offline: 'bg-signal-offline',
  maintenance: 'bg-signal-maintenance',
  unknown: 'bg-signal-unknown',
};

const VPN_GROUP_LABELS: Record<string, string> = {
  openvpn: 'OpenVPN',
  ipsec: 'IPsec',
  wireguard: 'WireGuard',
};

/** Quebra string de IPs (virgula ou espaco) em array; exibe uma ou varias. */
function parseIps(value: string | null | undefined): string[] {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Retorna true se o IP for público (não RFC 1918). Usado para classificar opt com IP público como WAN (multi-WAN). */
function isPublicIp(ip: string | null | undefined): boolean {
  const s = (ip ?? '').trim();
  if (!s || s === 'n/a') return false;
  const parts = s.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => n < 0 || n > 255 || Number.isNaN(n))) return false;
  if (parts[0] === 10) return false;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
  if (parts[0] === 192 && parts[1] === 168) return false;
  return true;
}

type ServiceItem = { name: string; status: string; message?: string | null; observed_at?: string };

function getServiceType(name: string): string {
  const colon = name.indexOf(':');
  if (colon >= 0) return name.slice(0, colon).toLowerCase();
  return name.toLowerCase();
}

/** Mensagens genéricas que não são descrição do túnel (ex.: "tunnel", "running, 0 clients"). */
const GENERIC_SERVICE_MESSAGES = new Set([
  'tunnel', 'established', 'interface up', 'no handshake',
  'running', 'running, 0 clients', 'stopped',
]);

/** Nome exibido do serviço: preferir description (message) quando for descrição real (ex. IPsec Phase 1). */
function getServiceDisplayName(service: ServiceItem): string {
  const idPart = service.name.includes(':') ? service.name.slice(service.name.indexOf(':') + 1) : service.name;
  const msg = (service.message ?? '').trim();
  if (msg && !GENERIC_SERVICE_MESSAGES.has(msg.toLowerCase())) {
    return msg;
  }
  return idPart;
}

/** Exibir message como subtítulo só quando for diferente do título (evita duplicar description). */
function getServiceSubtitle(service: ServiceItem): string | null {
  const displayName = getServiceDisplayName(service);
  const msg = (service.message ?? '').trim();
  if (!msg || msg === displayName) return null;
  if (GENERIC_SERVICE_MESSAGES.has(msg.toLowerCase())) return msg;
  return null;
}

function groupServicesByType(services: ServiceItem[]): { type: string; label: string; services: ServiceItem[] }[] {
  const byType = new Map<string, ServiceItem[]>();
  for (const s of services) {
    const type = getServiceType(s.name);
    const list = byType.get(type) ?? [];
    list.push(s);
    byType.set(type, list);
  }
  const order = ['openvpn', 'ipsec', 'wireguard'];
  const result: { type: string; label: string; services: ServiceItem[] }[] = [];
  for (const type of order) {
    const list = byType.get(type);
    if (list?.length) {
      result.push({ type, label: VPN_GROUP_LABELS[type] ?? type, services: list });
      byType.delete(type);
    }
  }
  byType.forEach((list, type) => {
    result.push({ type, label: type, services: list });
  });
  return result;
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
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
    <div className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
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
    <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 font-mono text-xs leading-relaxed text-cyan-100">
      {value}
    </pre>
  );
}

function normalizeHeartbeatMode(value: string | string[] | undefined): HeartbeatMode {
  return value === 'light' ? 'light' : 'normal';
}

function buildNodeDetailsHref(input: {
  id: string;
  heartbeatMode: HeartbeatMode;
  releaseBaseUrl?: string;
  controllerUrl?: string;
}) {
  const params = new URLSearchParams();
  params.set('heartbeat_mode', input.heartbeatMode);

  if (input.releaseBaseUrl) {
    params.set('release_base_url', input.releaseBaseUrl);
  }

  if (input.controllerUrl) {
    params.set('controller_url', input.controllerUrl);
  }

  const query = params.toString();
  return query ? `/nodes/${input.id}?${query}` : `/nodes/${input.id}`;
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
  const heartbeatMode = normalizeHeartbeatMode(resolvedSearchParams.heartbeat_mode);

  try {
    const [response, bootstrap, session] = await Promise.all([
      getNodeDetails(id),
      getNodeBootstrapCommand(id, releaseBaseUrl, controllerUrl, heartbeatMode),
      getSession(),
    ]);
    const { node } = response;
    const canManageNode = hasRole(session.user.role, ADMIN_ROLES);
    const identityLabel = `${node.client.name} — ${node.site.name} — ${node.node_uid}`;
    const testConnectionAuditHref = buildAuditHref({
      action: 'ingest.test_connection',
      targetType: 'node',
      targetId: node.id,
    });
    const nodeAuditHref = buildAuditHref({
      targetType: 'node',
      targetId: node.id,
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
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Firewall criado com sucesso. Use a secao de bootstrap abaixo para instalar o agente.
          </div>
        ) : null}
        {rekeyed ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Secret do agente rotacionado. Reinstale ou reconfigure o agente com o novo bootstrap.
          </div>
        ) : null}
        {rekeyError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Falha ao rotacionar secret: {rekeyError}
          </div>
        ) : null}
        {maintenanceState ? (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
            Maintenance mode {maintenanceState === 'enabled' ? 'ativado' : 'desativado'} com sucesso.
          </div>
        ) : null}
        {maintenanceError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Falha ao atualizar maintenance mode: {maintenanceError}
          </div>
        ) : null}
        {updated ? (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
            Metadados do firewall atualizados com sucesso.
          </div>
        ) : null}
        {updateError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Falha ao atualizar firewall: {updateError}
          </div>
        ) : null}

        <PageHero
          eyebrow="Firewall"
          title={node.display_name ?? node.hostname}
          description={identityLabel}
          stats={[
            { label: 'Status', value: node.effective_status },
            { label: 'Ultimo contato', value: formatRelativeAge(node.last_seen_at) },
            { label: 'pfSense', value: node.pfsense_version ?? '-' },
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Link
                  href="/nodes"
                  className="rounded-full border border-slate-700 bg-panel-soft px-4 py-2 text-sm text-cyan-200 transition hover:border-cyan-400/60 hover:text-white"
                >
                  Voltar para firewalls
                </Link>
                {canManageNode && (
                  <DeleteNodeButton
                    nodeId={node.id}
                    nodeUid={node.node_uid}
                    displayName={node.display_name}
                    hostname={node.hostname}
                  />
                )}
              </div>
            </div>
          }
        />

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="glass-panel rounded-xl p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Resumo do equipamento
              </p>
              {node.latest_heartbeat ? (
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
              ) : (
                <div className="mt-4 rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-6 text-sm text-slate-400">
                  Ainda nao ha dados recebidos deste firewall.
                </div>
              )}
            </div>

            <div className="glass-panel rounded-xl p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Servicos
              </p>
              {node.services.length > 0 ? (
                <div className="mt-4 space-y-4">
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
                            const title = isVpn ? (getServiceSubtitle(service) ?? service.status) : (service.message ?? service.status);
                            return (
                              <div
                                key={service.name}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-800/60 py-1.5 pl-2 pr-3"
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
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-6 text-sm text-slate-400">
                  Nenhum servico reportado ainda.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-panel rounded-xl p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Dados interfaces</p>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <p>Hostname: {node.hostname}</p>
                {(() => {
                  type Iface = { name?: string; ip?: string; role?: string };
                  const ifaces = (node.network_interfaces ?? []) as Iface[];
                  const hasValidInterfaces =
                    ifaces.length > 0 &&
                    ifaces.some(
                      (iface) => ((iface?.name ?? '').trim() || (iface?.ip ?? '').trim()) !== '',
                    );
                  const hasRole = ifaces.some((iface) => (iface?.role ?? '').trim() !== '');
                  const wanIfaces = hasRole
                    ? ifaces.filter(
                        (i) =>
                          ((i?.name ?? '').trim() || (i?.ip ?? '').trim()) !== '' &&
                          (() => {
                            const r = (i?.role ?? '').toLowerCase();
                            const ip = (i?.ip ?? '').trim();
                            if (r === 'wan') return true;
                            if (r.startsWith('opt') && isPublicIp(ip)) return true;
                            return false;
                          })(),
                      )
                    : [];
                  const internalIfaces = hasRole
                    ? ifaces.filter(
                        (i) =>
                          ((i?.name ?? '').trim() || (i?.ip ?? '').trim()) !== '' &&
                          (() => {
                            const r = (i?.role ?? '').toLowerCase();
                            const ip = (i?.ip ?? '').trim();
                            if (r === 'lan') return true;
                            if (r.startsWith('opt') && !isPublicIp(ip)) return true;
                            return false;
                          })(),
                      )
                    : [];
                  const interfacesAllEmpty =
                    ifaces.length > 0 &&
                    ifaces.every(
                      (iface) => !(iface?.name ?? '').trim() && !(iface?.ip ?? '').trim(),
                    );
                  if (hasValidInterfaces && hasRole && (internalIfaces.length > 0 || wanIfaces.length > 0)) {
                    return (
                      <div className="space-y-3">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="shrink-0 font-mono text-xs uppercase tracking-wider text-slate-500">
                            WAN
                          </span>
                          {wanIfaces.length > 0 ? (
                            <span className="flex flex-wrap gap-2">
                              {wanIfaces.map((iface, i) => {
                                const name = (iface?.name ?? '').trim() || '—';
                                const ip = (iface?.ip ?? '').trim() || 'n/a';
                                return (
                                  <span
                                    key={`wan-${name}-${ip}-${i}`}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1.5 font-mono text-xs text-slate-200"
                                  >
                                    <span className="font-semibold uppercase text-cyan-300/90">{name}</span>
                                    <span className={ip === 'n/a' ? 'text-slate-500 italic' : ''}>{ip}</span>
                                  </span>
                                );
                              })}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </p>
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="shrink-0 font-mono text-xs uppercase tracking-wider text-slate-500">
                            Interfaces
                          </span>
                          {internalIfaces.length > 0 ? (
                            <span className="flex flex-wrap gap-2">
                              {internalIfaces.map((iface, i) => {
                                const name = (iface?.name ?? '').trim() || '—';
                                const ip = (iface?.ip ?? '').trim() || 'n/a';
                                return (
                                  <span
                                    key={`int-${name}-${ip}-${i}`}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1.5 font-mono text-xs text-slate-200"
                                  >
                                    <span className="font-semibold uppercase text-cyan-300/90">{name}</span>
                                    <span className={ip === 'n/a' ? 'text-slate-500 italic' : ''}>{ip}</span>
                                  </span>
                                );
                              })}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </p>
                      </div>
                    );
                  }
                  if (hasValidInterfaces) {
                    return (
                      <div>
                        <div className="flex flex-wrap gap-2">
                          {ifaces
                            .filter((iface) => (iface?.name ?? '').trim() !== '' || (iface?.ip ?? '').trim() !== '')
                            .map((iface, i) => {
                              const name = (iface?.name ?? '').trim() || '—';
                              const ip = (iface?.ip ?? '').trim() || 'n/a';
                              return (
                                <span
                                  key={`${name}-${ip}-${i}`}
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1.5 font-mono text-xs text-slate-200"
                                >
                                  <span className="font-semibold uppercase text-cyan-300/90">{name}</span>
                                  <span className={ip === 'n/a' ? 'text-slate-500 italic' : ''}>{ip}</span>
                                </span>
                              );
                            })}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <>
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="shrink-0">IP(s) interno(s):</span>
                        {parseIps(node.management_ip).length > 0 ? (
                          parseIps(node.management_ip).map((ip) => (
                            <span
                              key={ip}
                              className="inline-flex rounded-full border border-slate-600 bg-slate-800/80 px-2.5 py-0.5 font-mono text-xs text-slate-200"
                            >
                              {ip}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="shrink-0">IP(s) publico(s) / WAN:</span>
                        {parseIps(node.wan_ip).length > 0 ? (
                          parseIps(node.wan_ip).map((ip) => (
                            <span
                              key={ip}
                              className="inline-flex rounded-full border border-slate-600 bg-slate-800/80 px-2.5 py-0.5 font-mono text-xs text-slate-200"
                            >
                              {ip}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </p>
                      {interfacesAllEmpty &&
                        parseIps(node.management_ip).length === 0 &&
                        parseIps(node.wan_ip).length === 0 && (
                          <p className="text-xs text-slate-500">
                            O agente enviou a lista de interfaces vazia. Para ver interfaces com nome (ADM, P4,
                            etc.), atualize o agente no firewall para a versão 0.2.20 ou superior e o painel para 0.1.20.
                          </p>
                        )}
                    </>
                  );
                })()}
                <p>Ultimo contato: {formatDateTime(node.latest_heartbeat?.received_at ?? null)}</p>
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
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
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
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4 text-sm text-slate-500">
                  Maintenance mode disponivel apenas para `admin` e `superadmin`.
                </div>
              )}
            </div>

            {canManageNode ? (
              <div className="glass-panel rounded-xl p-5">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Editar cadastro</p>
                <form action={updateNodeAction} className="mt-4 space-y-3">
                  <input type="hidden" name="node_id" value={node.id} />
                  <input type="hidden" name="hostname" value={node.hostname} />
                  <input type="hidden" name="management_ip" value={node.management_ip ?? ''} />
                  <input type="hidden" name="wan_ip" value={node.wan_ip ?? ''} />
                  <input
                    type="text"
                    name="display_name"
                    defaultValue={node.display_name ?? ''}
                    placeholder="Nome exibido"
                    className="w-full rounded-xl h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <div className="rounded-xl border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Hostname</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-300">{node.hostname || '—'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">IP de gerenciamento (resumo)</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-300">{node.management_ip || '—'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">IP WAN (resumo)</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-300">{node.wan_ip || '—'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Versão pfSense</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-300">
                      {node.pfsense_version ? node.pfsense_version.replace(/-RELEASE$/i, '') : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Versão do agente</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-300">
                      {node.agent_version ?? '—'}
                    </p>
                  </div>
                  <AdvancedSection
                    title="Campos avancados"
                    description="ha_role e outros campos para ambientes HA/CARP."
                  >
                    <input
                      type="text"
                      name="ha_role"
                      defaultValue={node.ha_role ?? ''}
                      placeholder="Papel HA"
                      className="w-full rounded-xl h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                  </AdvancedSection>
                  <button
                    type="submit"
                    className="w-full rounded-xl h-11 bg-cyan-500 px-5 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
                  >
                    Salvar metadados
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </section>

        <section className="glass-panel rounded-xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Alertas</p>
          <div className="mt-4 space-y-3">
            {node.recent_alerts.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-200">
                Nenhum alerta recente para este firewall.
              </div>
            ) : (
              node.recent_alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-xl border border-slate-800 bg-panel-soft/60 px-4 py-4"
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

        <section className="glass-panel rounded-xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Instalar agente</p>
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-200">Credencial do agente</p>
                <p className="mt-1 text-sm text-slate-500">Use a instalacao abaixo para conectar este firewall ao painel.</p>
              </div>
              {canManageNode ? (
                <form action={rotateNodeSecretAction}>
                  <input type="hidden" name="node_id" value={node.id} />
                  <button
                    type="submit"
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 transition hover:border-amber-400/50"
                  >
                    Rotacionar secret
                  </button>
                </form>
              ) : (
                <span className="text-sm text-slate-500">somente leitura</span>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <BootstrapField label="UID" value={bootstrap.node.node_uid} />
              <BootstrapField
                label={canManageNode ? 'Secret' : 'Secret hint'}
                value={canManageNode ? bootstrap.bootstrap.node_secret : bootstrap.bootstrap.secret_hint}
              />
            </div>

            {(bootstrap.package_command ?? bootstrap.command) ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300">Modo do heartbeat no install</p>
                    <span className="text-xs text-slate-500">
                      Atual: <strong className="text-slate-300">{bootstrap.heartbeat_mode}</strong>
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={buildNodeDetailsHref({
                        id: node.id,
                        heartbeatMode: 'normal',
                        releaseBaseUrl,
                        controllerUrl,
                      })}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        bootstrap.heartbeat_mode === 'normal'
                          ? 'border border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                          : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Normal
                    </Link>
                    <Link
                      href={buildNodeDetailsHref({
                        id: node.id,
                        heartbeatMode: 'light',
                        releaseBaseUrl,
                        controllerUrl,
                      })}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        bootstrap.heartbeat_mode === 'light'
                          ? 'border border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                          : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Light
                    </Link>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    <strong className="text-slate-300">Normal</strong> envia serviços e gateways em todo heartbeat.{' '}
                    <strong className="text-slate-300">Light</strong> envia só métricas e reaproveita o último estado conhecido.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300">Comando principal</p>
                  <CopyButton value={bootstrap.package_command ?? bootstrap.command ?? ''} />
                </div>
                <p className="text-sm text-slate-400">
                  Cole no pfSense em <strong>Diagnostics &gt; Command Prompt</strong>. Retorna na hora; instalação segue em segundo plano.
                </p>
                <CommandBlock value={bootstrap.package_command ?? bootstrap.command ?? ''} />
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                  <strong>Uso:</strong> (1) Abra Command Prompt no pfSense. (2) Cole o comando e execute. (3) Em 1–2 min o firewall deve aparecer online. Acompanhe: <code className="text-cyan-200">tail -f /tmp/monitor-install.log</code>
                </div>

                {bootstrap.uninstall_command ? (
                  <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">Remover pacote (uninstall)</p>
                      <CopyButton value={bootstrap.uninstall_command} />
                    </div>
                    <p className="text-sm text-slate-500">
                      Cole no pfSense em <strong>Diagnostics &gt; Command Prompt</strong> para remover por completo o pacote SystemUp Monitor deste firewall.
                    </p>
                    <CommandBlock value={bootstrap.uninstall_command} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                  O comando automatico ainda nao esta pronto para este firewall.
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-sm text-slate-400">
                  Publique a release do agente ou configure a base de download para o sistema montar o comando automaticamente.
                </div>
              </div>
            )}
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300">Comandos de teste no pfSense</p>
              <p className="text-sm text-slate-400">
                Execute no <strong>Diagnostics &gt; Command Prompt</strong> para validar antes e depois da instalação.
              </p>
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-300">Pré-instalação — versão, DNS e conectividade</p>
                  <p className="mb-2 text-xs text-slate-500">Valide versão do pfSense, resolução DNS e acesso HTTP/HTTPS aos URLs do controlador e do release.</p>
                  <CommandBlock value={pfSensePrecheckBlock} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-300">Pós-instalação — serviço e agente</p>
                  <p className="mb-2 text-xs text-slate-500">Após instalar: status do serviço, config, test-connection, heartbeat e log. Esperado: serviço rodando e respostas de sucesso.</p>
                  <CommandBlock value={bootstrap.verification.command_block} />
                </div>
              </div>
            </div>

            <AdvancedSection
              title="Mais opcoes e diagnostico"
              description="URLs, overrides e roteiro tecnico para homologacao."
            >
              <div className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  <BootstrapField label="Artefato" value={bootstrap.release.artifact_name} />
                  <BootstrapField
                    label="Controller URL"
                    value={bootstrap.release.controller_url}
                  />
                  <BootstrapField
                    label="Release base URL"
                    value={bootstrap.release.release_base_url ?? 'nao configurada'}
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
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                    <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Override operacional</p>
                    <form className="mt-4 flex flex-col gap-3">
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
                      <div className="flex flex-col gap-3 lg:flex-row">
                        <button
                          type="submit"
                          className="rounded-xl h-11 bg-cyan-500 px-5 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
                        >
                          Aplicar override
                        </button>
                        <Link
                          href={`/nodes/${node.id}`}
                          className="rounded-xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                        >
                          Limpar
                        </Link>
                      </div>
                    </form>
                  </div>
                ) : null}

                <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Pre-check no pfSense</p>
                  <CommandBlock value={pfSensePrecheckBlock} />
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
                  <Link
                    href={testConnectionAuditHref}
                    className="rounded-xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                  >
                    Ver eventos deste firewall
                  </Link>
                  <Link
                    href="/dashboard"
                    className="rounded-xl border border-slate-700 px-5 py-3 text-center text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
                  >
                    Dashboard
                  </Link>
                </div>
              </div>
            </AdvancedSection>
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
