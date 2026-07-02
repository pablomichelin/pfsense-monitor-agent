/** Serviços reiniciáveis via comando allowlistado (API + agente devem coincidir). */
export const SERVICE_RESTART_ALLOWLIST = [
  'monitor_pfsense_agent',
  'unbound',
  'dhcpd',
  'ntpd',
  'dpinger',
] as const;

export type RestartableService = (typeof SERVICE_RESTART_ALLOWLIST)[number];

const HA_PRIMARY_ROLE_PATTERN =
  /^(master|primary|carp[\s_-]?master|pfsync[\s_-]?master)$/i;

export function isRestartableService(value: string): value is RestartableService {
  return (SERVICE_RESTART_ALLOWLIST as readonly string[]).includes(value);
}

export function normalizeRestartableService(raw: unknown): RestartableService {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('service is required');
  }

  const service = raw.trim().toLowerCase();
  if (!isRestartableService(service)) {
    throw new Error(`service "${service}" is not in allowlist`);
  }

  return service;
}

export function isHaNode(input: {
  haRole?: string | null;
  haDetectedFromAgent?: boolean;
}): boolean {
  return Boolean(input.haRole?.trim()) || input.haDetectedFromAgent === true;
}

export function isHaPrimaryRole(haRole?: string | null): boolean {
  const normalized = haRole?.trim();
  if (!normalized) {
    return false;
  }

  if (HA_PRIMARY_ROLE_PATTERN.test(normalized)) {
    return true;
  }

  return normalized.toLowerCase().includes('master');
}

export function confirmationMatchesHostname(
  hostname: string,
  value: string,
): boolean {
  const trimmed = value.trim();
  return trimmed === hostname || trimmed.toUpperCase() === 'CONFIRMAR';
}

export function validateRebootDelaySeconds(raw: unknown): number {
  if (raw == null || raw === '') {
    return 60;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 30 || parsed > 600) {
    throw new Error('delay_seconds must be between 30 and 600');
  }

  return Math.trunc(parsed);
}

export function validateServiceRestartPayload(
  payload: unknown,
): { service: RestartableService } {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('invalid service_restart payload');
  }

  const raw = payload as Record<string, unknown>;
  return {
    service: normalizeRestartableService(raw.service),
  };
}

export function validateNodeRebootPayload(payload: unknown): {
  delay_seconds: number;
  enable_maintenance_mode: boolean;
  acknowledge_ha_risk: boolean;
} {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('invalid node_reboot payload');
  }

  const raw = payload as Record<string, unknown>;

  return {
    delay_seconds: validateRebootDelaySeconds(raw.delay_seconds),
    enable_maintenance_mode:
      raw.enable_maintenance_mode == null
        ? true
        : Boolean(raw.enable_maintenance_mode),
    acknowledge_ha_risk: raw.acknowledge_ha_risk === true,
  };
}

export function evaluateRebootMaintenanceGate(input: {
  maintenanceMode: boolean;
  enableMaintenanceMode: boolean;
}): { allowed: boolean; willEnableMaintenance: boolean } {
  if (input.maintenanceMode) {
    return { allowed: true, willEnableMaintenance: false };
  }

  if (input.enableMaintenanceMode) {
    return { allowed: true, willEnableMaintenance: true };
  }

  return { allowed: false, willEnableMaintenance: false };
}

export function evaluateHaRebootGate(input: {
  haRole?: string | null;
  haDetectedFromAgent?: boolean;
  acknowledgeHaRisk: boolean;
}): { blocked: boolean; requiresAcknowledgement: boolean; reason?: string } {
  if (!isHaNode(input)) {
    return { blocked: false, requiresAcknowledgement: false };
  }

  const isPrimary = isHaPrimaryRole(input.haRole);
  if (isPrimary && !input.acknowledgeHaRisk) {
    return {
      blocked: true,
      requiresAcknowledgement: true,
      reason: 'HA primary node requires acknowledge_ha_risk',
    };
  }

  if (!isPrimary && !input.acknowledgeHaRisk) {
    return {
      blocked: true,
      requiresAcknowledgement: true,
      reason: 'HA node requires acknowledge_ha_risk',
    };
  }

  return { blocked: false, requiresAcknowledgement: true };
}
