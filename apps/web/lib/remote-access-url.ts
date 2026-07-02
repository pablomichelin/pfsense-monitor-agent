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
): string {
  const ip = extractPrimaryIp(wanIp) ?? extractPrimaryIp(managementIp);
  return ip ? `https://${ip}:9999` : '';
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

  const derived = buildDefaultRemoteAccessUrl(wanIp, managementIp);
  return derived || null;
}
