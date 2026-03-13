import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

const apiBaseUrl = process.env.MONITOR_API_BASE_URL?.trim();

const requireEnv = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
};

export async function GET(request: Request): Promise<Response> {
  const requestHeaders = await headers();
  const upstreamHeaders = new Headers();

  const cookieHeader = requestHeaders.get('cookie');
  if (cookieHeader) {
    upstreamHeaders.set('cookie', cookieHeader);
  }

  const userAgent = requestHeaders.get('user-agent');
  if (userAgent) {
    upstreamHeaders.set('user-agent', userAgent);
  }

  const cfConnectingIp = requestHeaders.get('cf-connecting-ip');
  if (cfConnectingIp) {
    upstreamHeaders.set('cf-connecting-ip', cfConnectingIp);
  }

  const lastEventId = requestHeaders.get('last-event-id');
  if (lastEventId) {
    upstreamHeaders.set('last-event-id', lastEventId);
  }

  const response = await fetch(
    `${requireEnv(apiBaseUrl, 'MONITOR_API_BASE_URL')}/api/v1/dashboard/events`,
    {
      method: 'GET',
      headers: upstreamHeaders,
      cache: 'no-store',
      signal: request.signal,
    },
  );

  if (!response.body) {
    return new Response('upstream stream unavailable', {
      status: 502,
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type':
        response.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
