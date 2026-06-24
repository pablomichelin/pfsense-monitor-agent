import { proxyMfa } from '@/lib/mfa-proxy';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return proxyMfa('/api/v1/auth/mfa/enroll/start', { method: 'POST' });
}
