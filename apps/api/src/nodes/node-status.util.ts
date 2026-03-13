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

export const mapServiceStatus = (
  status: HeartbeatServiceDto['status'],
): ServiceStatus => status;

export const mapGatewayStatus = (
  status: HeartbeatGatewayDto['status'],
): GatewayStatus => status;

export const isServiceProblem = (service: HeartbeatServiceDto): boolean =>
  DEGRADED_SERVICE_STATUSES.has(mapServiceStatus(service.status));

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

export const calculateNodeStatus = (input: {
  maintenanceMode: boolean;
  services: HeartbeatServiceDto[];
  gateways: HeartbeatGatewayDto[];
}): NodeStatus => {
  if (input.maintenanceMode) {
    return NodeStatus.maintenance;
  }

  if (
    input.services.some((service) => isServiceProblem(service)) ||
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

  const normalizedName = service.name.toLowerCase();
  const severity =
    CRITICAL_SERVICES.has(normalizedName) && service.status === 'stopped'
      ? AlertSeverity.critical
      : WARNING_SERVICES.has(normalizedName)
        ? AlertSeverity.warning
        : AlertSeverity.warning;

  return {
    severity,
    title: `Service ${service.name} ${service.status}`,
    description:
      service.message ||
      `The monitored service ${service.name} reported status ${service.status}.`,
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
