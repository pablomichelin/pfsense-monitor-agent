import { ClientIpRequest, resolveClientIp } from '../common/client-ip';
import { appConfig } from '../config/app-config';
import { BlockList, isIP } from 'node:net';

/** Walk from the TCP peer toward the client; never trust a claimed CF header. */
export function createLoginClientIpResolver(ranges: string[]) {
  const trusted = new BlockList();
  for (const range of ranges) {
    const [address, prefix, extra] = range.split('/');
    const family = isIP(address);
    const bits = prefix === undefined ? (family === 4 ? 32 : 128) : Number(prefix);
    if (!family || extra !== undefined || !Number.isInteger(bits) || bits < 1 || bits > (family === 4 ? 32 : 128)) {
      throw new Error('Invalid LOGIN_TRUSTED_PROXY_CIDRS');
    }
    trusted.addSubnet(address, bits, family === 4 ? 'ipv4' : 'ipv6');
  }
  return (request: ClientIpRequest): string => {
    const normalize = (value: string) => value.replace(/^::ffff:(?=\d+\.)/i, '');
    const peer = normalize(request.socket?.remoteAddress ?? 'unknown');
    const header = request.headers['x-forwarded-for'];
    if (typeof header !== 'string' || header.length > 4096) return peer;
    const forwarded = header.split(',').map(value => normalize(value.trim()));
    if (forwarded.length > 32 || forwarded.some(value => !isIP(value))) return peer;
    let current = peer;
    for (const address of forwarded.reverse()) {
      const family = isIP(current);
      if (!family || !trusted.check(current, family === 4 ? 'ipv4' : 'ipv6')) break;
      current = address;
    }
    return current;
  };
}

const loginRanges = (process.env.LOGIN_TRUSTED_PROXY_CIDRS ?? '').split(',').map(s => s.trim()).filter(Boolean);
const resolveExplicitChain = loginRanges.length ? createLoginClientIpResolver(loginRanges) : null;

/** A globally trusted XFF header must not let a caller reset the password budget. */
export function resolveLoginClientIp(request: ClientIpRequest): string {
  if (resolveExplicitChain) return resolveExplicitChain(request);
  if (!appConfig.trustProxy || appConfig.trustedProxyIps.length === 0) {
    return request.socket?.remoteAddress ?? 'unknown';
  }
  return resolveClientIp(request);
}
