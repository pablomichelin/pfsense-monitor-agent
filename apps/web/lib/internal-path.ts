const BLOCKED_PREFIXES = ['/login', '/api'];

export function sanitizeInternalPath(
  rawPath: string | undefined | null,
): string | null {
  const path = rawPath?.trim();
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\\\\\u0000-\u001f\u007f]/.test(path)) {
    return null;
  }

  // The URL parser treats backslashes as slashes in special schemes. Verify the
  // parsed origin too, so all login redirects remain on this application.
  const base = 'https://internal.invalid';
  let parsed: URL;
  try {
    parsed = new URL(path, base);
  } catch {
    return null;
  }
  if (parsed.origin !== base ||
      BLOCKED_PREFIXES.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
