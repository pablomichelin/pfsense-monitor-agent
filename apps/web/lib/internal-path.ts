const BLOCKED_PREFIXES = ['/login', '/api/'];

export function sanitizeInternalPath(
  rawPath: string | undefined | null,
): string | null {
  const path = rawPath?.trim();
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return null;
  }

  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}`))) {
    return null;
  }

  return path;
}
