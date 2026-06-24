import { proxyMfa } from '@/lib/mfa-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  return proxyMfa('/api/v1/auth/mfa/enroll/verify', { method: 'POST', body });
}
