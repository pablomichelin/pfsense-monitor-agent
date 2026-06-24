import { proxyMfa } from '@/lib/mfa-proxy';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return proxyMfa('/api/v1/auth/mfa/status', { method: 'GET' });
}
