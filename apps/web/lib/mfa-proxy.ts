import { headers } from 'next/headers';

const apiBaseUrl = process.env.MONITOR_API_BASE_URL?.trim();
const csrfCookieName =
  process.env.MONITOR_AUTH_CSRF_COOKIE_NAME?.trim() || 'monitor_pfsense_csrf';

const requireEnv = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
};

const parseCookies = (cookieHeader: string | null): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, entry) => {
    const [name, ...rest] = entry.trim().split('=');
    if (!name || rest.length === 0) {
      return acc;
    }
    acc[name] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
};

/**
 * C-MFA: proxy server-side dos endpoints de MFA. Encaminha os cookies httpOnly da
 * sessao e injeta o header X-CSRF-Token nas mutacoes, mantendo o segredo/QR e os
 * codigos de recuperacao fora da URL.
 */
export async function proxyMfa(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<Response> {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get('cookie');
  const cookies = parseCookies(cookieHeader);

  const upstreamHeaders: Record<string, string> = {};
  if (cookieHeader) {
    upstreamHeaders.cookie = cookieHeader;
  }
  const userAgent = requestHeaders.get('user-agent');
  if (userAgent) {
    upstreamHeaders['user-agent'] = userAgent;
  }
  const cfConnectingIp = requestHeaders.get('cf-connecting-ip');
  if (cfConnectingIp) {
    upstreamHeaders['cf-connecting-ip'] = cfConnectingIp;
  }

  if (init.method === 'POST') {
    upstreamHeaders['content-type'] = 'application/json';
    const csrfToken = cookies[csrfCookieName];
    if (csrfToken) {
      upstreamHeaders['x-csrf-token'] = csrfToken;
    }
  }

  const response = await fetch(
    `${requireEnv(apiBaseUrl, 'MONITOR_API_BASE_URL')}${path}`,
    {
      method: init.method,
      headers: upstreamHeaders,
      body:
        init.method === 'POST'
          ? JSON.stringify(init.body ?? {})
          : undefined,
      cache: 'no-store',
    },
  );

  const text = await response.text();
  return new Response(text || '{}', {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
