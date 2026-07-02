const IP_SPLIT = /[,;\s]+/;

export function extractPrimaryIp(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const first = trimmed.split(IP_SPLIT).find((part) => part.trim().length > 0);
  return first?.trim() || undefined;
}

export function buildDefaultRemoteAccessUrl(
  wanIp?: string | null,
  managementIp?: string | null,
): string | null {
  const ip = extractPrimaryIp(wanIp) ?? extractPrimaryIp(managementIp);
  if (!ip) {
    return null;
  }

  return `https://${ip}:9999`;
}

export function resolveRemoteAccessUrl(
  stored: string | null | undefined,
  wanIp?: string | null,
  managementIp?: string | null,
): string | null {
  const explicit = stored?.trim();
  if (explicit) {
    return explicit;
  }

  return buildDefaultRemoteAccessUrl(wanIp, managementIp);
}
