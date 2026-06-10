import {
  AlertSeverity,
  GatewayStatus,
  NodeStatus,
  ServiceStatus,
} from '@prisma/client';
import { appConfig } from '../config/app-config';
import {
  HeartbeatGatewayDto,
  HeartbeatServiceDto,
} from '../ingest/dto/heartbeat.dto';

const CRITICAL_SERVICES = new Set(['openvpn', 'ipsec', 'wireguard']);
const WARNING_SERVICES = new Set(['unbound', 'dhcpd', 'ntpd']);
const DEGRADED_SERVICE_STATUSES = new Set<ServiceStatus>([
  'stopped',
  'degraded',
  'unknown',
]);

/** Serviços que podem estar ok mesmo com 0 clientes conectados (ex.: OpenVPN server). */
const ALLOW_NO_CLIENTS_SERVICES = new Set([
  'openvpn',
  'openvpn_server',
  'openvpn_client',
]);

/** Padrão de mensagem que indica "serviço ok, só não tem clientes" — não degrada nem gera alerta. */
const NO_CLIENTS_MESSAGE_PATTERN =
  /no clients|0 clients|waiting for clients|nenhum cliente|aguardando clientes/i;

/** Tipo do serviço: prefixo antes de ":" (ex.: openvpn:ovpns1 -> openvpn) ou nome inteiro. */
export function getServiceType(serviceName: string): string {
  const name = serviceName.trim();
  const colon = name.indexOf(':');
  if (colon >= 0) {
    return name.slice(0, colon).toLowerCase();
  }
  return name.toLowerCase();
}

function isNoClientsOnly(service: HeartbeatServiceDto): boolean {
  const name = service.name.toLowerCase();
  const type = getServiceType(service.name);
  const allowed =
    ALLOW_NO_CLIENTS_SERVICES.has(name) || type === 'openvpn';
  if (!allowed) {
    return false;
  }
  const status = mapServiceStatus(service.status);
  if (status !== 'stopped' && status !== 'degraded') {
    return false;
  }
  const msg = (service.message ?? '').trim();
  return NO_CLIENTS_MESSAGE_PATTERN.test(msg);
}

export const mapServiceStatus = (
  status: HeartbeatServiceDto['status'],
): ServiceStatus => status;

export const mapGatewayStatus = (
  status: HeartbeatGatewayDto['status'],
): GatewayStatus => status;

/** true se o serviço deve ser considerado problema. Exceção: not_installed e "sem clientes" em serviços da allow-list. */
export const isServiceProblem = (service: HeartbeatServiceDto): boolean => {
  if (mapServiceStatus(service.status) === 'not_installed') {
    return false;
  }
  if (!DEGRADED_SERVICE_STATUSES.has(mapServiceStatus(service.status))) {
    return false;
  }
  if (isNoClientsOnly(service)) {
    return false;
  }
  return true;
};

export const isGatewayProblem = (gateway: HeartbeatGatewayDto): boolean => {
  if (mapGatewayStatus(gateway.status) !== GatewayStatus.online) {
    return true;
  }

  if (
    gateway.latency_ms !== undefined &&
    gateway.latency_ms > appConfig.gateway.degradedLatencyMs
  ) {
    return true;
  }

  if (
    gateway.loss_percent !== undefined &&
    gateway.loss_percent > appConfig.gateway.degradedLossPercent
  ) {
    return true;
  }

  return false;
};

/** Servicos com impact_on_status === 'optional' nao degradam o node. Omitido = critical. */
export const serviceCountsForDegraded = (service: HeartbeatServiceDto): boolean =>
  isServiceProblem(service) && (service.impact_on_status ?? 'critical') !== 'optional';

export const calculateNodeStatus = (input: {
  maintenanceMode: boolean;
  services: HeartbeatServiceDto[];
  gateways: HeartbeatGatewayDto[];
}): NodeStatus => {
  if (input.maintenanceMode) {
    return NodeStatus.maintenance;
  }

  if (
    input.services.some((service) => serviceCountsForDegraded(service)) ||
    input.gateways.some((gateway) => isGatewayProblem(gateway))
  ) {
    return NodeStatus.degraded;
  }

  return NodeStatus.online;
};

export const deriveEffectiveNodeStatus = (
  node: {
    status: NodeStatus;
    maintenanceMode: boolean;
    lastSeenAt: Date | null;
  },
  now: Date = new Date(),
): NodeStatus => {
  if (node.maintenanceMode) {
    return NodeStatus.maintenance;
  }

  if (!node.lastSeenAt) {
    return node.status === NodeStatus.maintenance ? NodeStatus.maintenance : NodeStatus.unknown;
  }

  const ageSeconds = Math.floor(
    (now.getTime() - node.lastSeenAt.getTime()) / 1000,
  );

  if (ageSeconds > appConfig.nodeStatus.offlineAfterSeconds) {
    return NodeStatus.offline;
  }

  if (ageSeconds > appConfig.nodeStatus.degradedAfterSeconds) {
    return NodeStatus.degraded;
  }

  return node.status;
};

export const buildServiceAlert = (
  service: HeartbeatServiceDto,
): {
  severity: AlertSeverity;
  title: string;
  description: string;
} | null => {
  if (!isServiceProblem(service)) {
    return null;
  }

  const serviceType = getServiceType(service.name);
  const severity =
    CRITICAL_SERVICES.has(serviceType) && service.status === 'stopped'
      ? AlertSeverity.critical
      : WARNING_SERVICES.has(serviceType)
        ? AlertSeverity.warning
        : AlertSeverity.warning;

  const displayName =
    serviceType !== service.name.toLowerCase()
      ? `${serviceType} tunnel ${service.name.slice(serviceType.length + 1)}`
      : service.name;

  return {
    severity,
    title: `Service ${displayName} ${service.status}`,
    description:
      service.message ||
      `The monitored service ${displayName} reported status ${service.status}.`,
  };
};

export const buildGatewayAlert = (
  gateway: HeartbeatGatewayDto,
): {
  severity: AlertSeverity;
  title: string;
  description: string;
} | null => {
  if (!isGatewayProblem(gateway)) {
    return null;
  }

  const severity =
    gateway.status === 'down' ? AlertSeverity.critical : AlertSeverity.warning;

  const metrics = [
    gateway.latency_ms !== undefined
      ? `latency ${gateway.latency_ms} ms`
      : null,
    gateway.loss_percent !== undefined
      ? `loss ${gateway.loss_percent}%`
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    severity,
    title: `Gateway ${gateway.name} ${gateway.status}`,
    description: metrics
      ? `Gateway ${gateway.name} reported status ${gateway.status} with ${metrics}.`
      : `Gateway ${gateway.name} reported status ${gateway.status}.`,
  };
};
