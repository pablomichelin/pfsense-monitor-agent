import { ClientIpRequest, resolveClientIp } from '../common/client-ip';
import { appConfig } from '../config/app-config';

/** A globally trusted XFF header must not let a caller reset the password budget. */
export function resolveLoginClientIp(request: ClientIpRequest): string {
  if (!appConfig.trustProxy || appConfig.trustedProxyIps.length === 0) {
    return request.socket?.remoteAddress ?? 'unknown';
  }
  return resolveClientIp(request);
}
