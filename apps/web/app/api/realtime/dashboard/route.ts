import { headers } from 'next/headers';
import { setTimeout } from 'node:timers/promises';

export const dynamic = 'force-dynamic';

const apiBaseUrl = process.env.MONITOR_API_BASE_URL?.trim();
const streamRetryDelaysMs = [250, 1000];
const upstreamHandshakeTimeoutMs = 5000;
// The API sends a keepalive every 15 seconds.
const upstreamIdleTimeoutMs = 45_000;
const transientStatuses = new Set([502, 503, 504]);

async function connectUpstream(
  url: string,
  headers: Headers,
  signal: AbortSignal,
): Promise<Response | null> {
  const connect = async () => {
    const handshake = new AbortController();
    const timeout = globalThis.setTimeout(() => handshake.abort(), upstreamHandshakeTimeoutMs);
    try {
      return await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: AbortSignal.any([signal, handshake.signal]),
      });
    } catch {
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  };

  let response = await connect();
  for (const delay of streamRetryDelaysMs) {
    if (signal.aborted || (response && !transientStatuses.has(response.status))) break;

    // A transient HTTP response ends the browser stream once sent downstream.
    await response?.body?.cancel().catch(() => {});
    const retry = await setTimeout(delay, true, { signal }).catch(() => false);
    if (!retry) return null;
    response = await connect();
  }
  return response;
}

function reconnectWhenUpstreamIsSilent(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let cancelled = false;

  return new ReadableStream({
    async pull(controller) {
      const deadline = globalThis.setTimeout(() => {
        if (cancelled) return;
        cancelled = true;
        controller.close();
        void reader.cancel().catch(() => {});
      }, upstreamIdleTimeoutMs);
      try {
        const chunk = await reader.read();
        if (cancelled) return;
        if (chunk.done) controller.close();
        else controller.enqueue(chunk.value);
      } catch {
        // A clean end lets EventSource reconnect even if the upstream socket failed.
        if (!cancelled) controller.close();
      } finally {
        globalThis.clearTimeout(deadline);
      }
    },
    cancel(reason) {
      cancelled = true;
      return reader.cancel(reason);
    },
  });
}

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

  const response = apiBaseUrl
    ? await connectUpstream(`${apiBaseUrl}/api/v1/dashboard/events`, upstreamHeaders, request.signal)
    : null;
  if (!response) {
    return new Response('upstream stream unavailable', { status: 502 });
  }

  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
    await response.body?.cancel().catch(() => {});
    return new Response('upstream stream unavailable', {
      status: response.ok ? 502 : response.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (!response.body) {
    return new Response('upstream stream unavailable', {
      status: 502,
    });
  }

  return new Response(reconnectWhenUpstreamIsSilent(response.body), {
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
