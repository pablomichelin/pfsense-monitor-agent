import {
  NodeCapabilityAccessMode,
  Prisma,
} from '@prisma/client';

export interface HeartbeatCapabilitiesInput {
  pfrest_enabled?: boolean | null;
  pfrest_version?: string;
  api_base_url?: string;
  access_mode?: string;
  auth_method?: string;
  modules?: string[];
}

export interface NormalizedNodeCapabilities {
  pfrestEnabled: boolean | null;
  pfrestVersion: string | null;
  apiBaseUrl: string | null;
  accessMode: NodeCapabilityAccessMode;
  authMethod: string | null;
  capabilitiesJson: Prisma.JsonObject | null;
}

const ACCESS_MODES = new Set<string>([
  NodeCapabilityAccessMode.unknown,
  NodeCapabilityAccessMode.direct,
  NodeCapabilityAccessMode.agent,
  NodeCapabilityAccessMode.manual,
]);

export function normalizeAccessMode(value?: string): NodeCapabilityAccessMode {
  const normalized = (value ?? '').trim().toLowerCase();
  if (ACCESS_MODES.has(normalized)) {
    return normalized as NodeCapabilityAccessMode;
  }
  return NodeCapabilityAccessMode.unknown;
}

export function normalizeHeartbeatCapabilities(
  input: HeartbeatCapabilitiesInput,
): NormalizedNodeCapabilities {
  const modules = Array.isArray(input.modules)
    ? input.modules
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 32)
    : [];

  const capabilitiesJson =
    modules.length > 0
      ? ({ modules } satisfies Prisma.JsonObject)
      : null;

  return {
    pfrestEnabled:
      typeof input.pfrest_enabled === 'boolean' ? input.pfrest_enabled : null,
    pfrestVersion: input.pfrest_version?.trim().slice(0, 64) || null,
    apiBaseUrl: input.api_base_url?.trim().slice(0, 512) || null,
    accessMode: normalizeAccessMode(input.access_mode ?? 'agent'),
    authMethod: input.auth_method?.trim().slice(0, 64) || null,
    capabilitiesJson,
  };
}

export async function syncNodeCapabilities(
  tx: Prisma.TransactionClient,
  nodeId: string,
  capabilities: NormalizedNodeCapabilities,
  observedAt: Date,
): Promise<void> {
  await tx.nodeCapability.upsert({
    where: { nodeId },
    create: {
      nodeId,
      pfrestEnabled: capabilities.pfrestEnabled,
      pfrestVersion: capabilities.pfrestVersion,
      apiBaseUrl: capabilities.apiBaseUrl,
      accessMode: capabilities.accessMode,
      authMethod: capabilities.authMethod,
      capabilitiesJson: capabilities.capabilitiesJson ?? Prisma.JsonNull,
      lastReportedAt: observedAt,
      observedAt,
    },
    update: {
      pfrestEnabled: capabilities.pfrestEnabled,
      pfrestVersion: capabilities.pfrestVersion,
      apiBaseUrl: capabilities.apiBaseUrl,
      accessMode: capabilities.accessMode,
      authMethod: capabilities.authMethod,
      capabilitiesJson: capabilities.capabilitiesJson ?? Prisma.JsonNull,
      lastReportedAt: observedAt,
      observedAt,
    },
  });
}

export function buildSecretHint(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) {
    return '****';
  }
  return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
}
