import type { StatusBadgeStatus } from '@/components/ui/status-badge';

export type HeartbeatMode = 'normal' | 'light';
export type ConfigBackupInstallMode = 'default' | 'yes' | 'no';
export type NodeDetailTabId = 'overview' | 'metrics' | 'alerts' | 'backup' | 'config';

export const VPN_GROUP_LABELS: Record<string, string> = {
  openvpn: 'OpenVPN',
  ipsec: 'IPsec',
  wireguard: 'WireGuard',
};

export type ServiceItem = {
  name: string;
  status: string;
  message?: string | null;
  observed_at?: string;
};

const GENERIC_SERVICE_MESSAGES = new Set([
  'tunnel',
  'established',
  'interface up',
  'no handshake',
  'running',
  'running, 0 clients',
  'stopped',
]);

export function parseIps(value: string | null | undefined): string[] {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isPublicIp(ip: string | null | undefined): boolean {
  const s = (ip ?? '').trim();
  if (!s || s === 'n/a') return false;
  const parts = s.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => n < 0 || n > 255 || Number.isNaN(n))) return false;
  if (parts[0] === 10) return false;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
  if (parts[0] === 192 && parts[1] === 168) return false;
  return true;
}

export function getServiceType(name: string): string {
  const colon = name.indexOf(':');
  if (colon >= 0) return name.slice(0, colon).toLowerCase();
  return name.toLowerCase();
}

export function getServiceDisplayName(service: ServiceItem): string {
  const idPart = service.name.includes(':') ? service.name.slice(service.name.indexOf(':') + 1) : service.name;
  const msg = (service.message ?? '').trim();
  if (msg && !GENERIC_SERVICE_MESSAGES.has(msg.toLowerCase())) {
    return msg;
  }
  return idPart;
}

export function getServiceSubtitle(service: ServiceItem): string | null {
  const displayName = getServiceDisplayName(service);
  const msg = (service.message ?? '').trim();
  if (!msg || msg === displayName) return null;
  if (GENERIC_SERVICE_MESSAGES.has(msg.toLowerCase())) return msg;
  return null;
}

export function groupServicesByType(services: ServiceItem[]): { type: string; label: string; services: ServiceItem[] }[] {
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

export function normalizeHeartbeatMode(value: string | string[] | undefined): HeartbeatMode {
  return value === 'light' ? 'light' : 'normal';
}

export function normalizeConfigBackupInstallMode(
  value: string | string[] | undefined,
): ConfigBackupInstallMode {
  if (value === 'yes' || value === 'no') {
    return value;
  }
  return 'default';
}

export function normalizeNodeDetailTab(value: string | string[] | undefined): NodeDetailTabId | undefined {
  if (typeof value !== 'string') return undefined;
  const valid: NodeDetailTabId[] = ['overview', 'metrics', 'alerts', 'backup', 'config'];
  return valid.includes(value as NodeDetailTabId) ? (value as NodeDetailTabId) : undefined;
}

export function buildNodeDetailsHref(input: {
  id: string;
  tab?: NodeDetailTabId;
  heartbeatMode?: HeartbeatMode;
  configBackupInstallMode?: ConfigBackupInstallMode;
  releaseBaseUrl?: string;
  controllerUrl?: string;
}) {
  const params = new URLSearchParams();
  if (input.tab) {
    params.set('tab', input.tab);
  }
  if (input.heartbeatMode) {
    params.set('heartbeat_mode', input.heartbeatMode);
  }
  if (input.configBackupInstallMode && input.configBackupInstallMode !== 'default') {
    params.set('config_backup_enabled', input.configBackupInstallMode);
  }
  if (input.releaseBaseUrl) {
    params.set('release_base_url', input.releaseBaseUrl);
  }
  if (input.controllerUrl) {
    params.set('controller_url', input.controllerUrl);
  }
  const query = params.toString();
  return query ? `/nodes/${input.id}?${query}` : `/nodes/${input.id}`;
}

export function buildAuditHref(input: {
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

export function extractHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function buildPfSensePrecheckBlock(input: {
  controllerUrl: string;
  installerUrl: string | null;
  artifactUrl: string | null;
  checksumUrl: string | null;
}) {
  const lines = ['cat /etc/version', '', '# teste de DNS para os destinos da rodada'];

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

export function operationalStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    online: 'Online',
    offline: 'Offline',
    degraded: 'Degradado',
    maintenance: 'Manutenção',
    unknown: 'Desconhecido',
  };
  return labels[status] ?? status;
}

export function toOperationalStatusBadge(status: string): StatusBadgeStatus {
  const map: Record<string, StatusBadgeStatus> = {
    online: 'online',
    offline: 'offline',
    degraded: 'degraded',
    maintenance: 'maintenance',
    unknown: 'unknown',
  };
  return map[status] ?? 'unknown';
}

export function statusHeroTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'online':
      return 'success';
    case 'degraded':
      return 'warning';
    case 'offline':
      return 'danger';
    default:
      return 'default';
  }
}
