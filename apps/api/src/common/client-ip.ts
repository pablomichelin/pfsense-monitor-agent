import { appConfig } from '../config/app-config';

export type ClientIpRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string | null };
};

/**
 * C5: resolucao de IP real do cliente com trust proxy restrito.
 *
 * CF-Connecting-IP (e demais headers de proxy) so e aceito quando a conexao TCP
 * imediata vem de um proxy confiavel (TRUSTED_PROXY_IPS). Caso contrario, usa o IP
 * direto da conexao, evitando spoofing de header por clientes nao confiaveis.
 */

export function readHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() || undefined : undefined;
  }
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }
  return undefined;
}

function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/i, '');
}

export function isTrustedProxyPeer(request: ClientIpRequest): boolean {
  if (!appConfig.trustProxy) {
    return false;
  }

  // trustProxy habilitado sem lista explicita: confia (configuracao deliberada).
  if (appConfig.trustedProxyIps.length === 0) {
    return true;
  }

  const peer = request.socket?.remoteAddress ?? '';
  if (peer === '') {
    return false;
  }

  const normalized = normalizeIp(peer);
  return (
    appConfig.trustedProxyIps.includes(peer) ||
    appConfig.trustedProxyIps.includes(normalized)
  );
}

export function resolveClientIp(request: ClientIpRequest): string {
  if (isTrustedProxyPeer(request)) {
    const cf = readHeaderValue(request.headers['cf-connecting-ip']);
    if (cf) {
      return cf;
    }
  }

  return request.ip ?? 'unknown';
}
