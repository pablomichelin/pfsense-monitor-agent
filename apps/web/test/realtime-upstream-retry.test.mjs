import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { deferred, sourceLoader } from './source-harness.mjs';

const origin = 'http://127.0.0.1:1';

function makeRoute(t, connect, wait) {
  const previous = process.env.MONITOR_API_BASE_URL;
  process.env.MONITOR_API_BASE_URL = origin;
  t.after(() => {
    if (previous === undefined) delete process.env.MONITOR_API_BASE_URL;
    else process.env.MONITOR_API_BASE_URL = previous;
  });
  const requestHeaders = new Headers({
    cookie: 'qa-session=fixture', 'last-event-id': 'qa-1', 'user-agent': 'qa-browser',
  });
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, origin + '/api/v1/dashboard/events');
    assert.equal(options.headers.get('cookie'), requestHeaders.get('cookie'));
    assert.equal(options.headers.get('last-event-id'), 'qa-1');
    assert.equal(options.cache, 'no-store');
    return connect();
  });
  const { GET } = sourceLoader({
    'next/headers': { headers: async () => requestHeaders },
    'node:timers/promises': { setTimeout: wait },
  })('app/api/realtime/dashboard/route.ts');
  return { GET, fetch };
}

function response(status, onCancel) {
  return new Response(new ReadableStream({ cancel() { onCancel(); } }), { status });
}

test('a transient 502 or connection rejection can recover before EventSource sees a response', async (t) => {
  let cancelled = 0;
  const delays = [];
  const results = [
    () => response(502, () => { cancelled++; }),
    () => { throw new Error('synthetic connection interruption'); },
    () => new Response('event: connected\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } }),
  ];
  const { GET, fetch } = makeRoute(t, () => results.shift()(), async (ms, value) => {
    delays.push(ms);
    return value;
  });
  const stream = await GET(new Request(origin + '/api/realtime/dashboard'));
  assert.equal(stream.status, 200);
  assert.equal(stream.headers.get('content-type'), 'text/event-stream');
  assert.equal(await stream.text(), 'event: connected\ndata: {}\n\n');
  assert.equal(fetch.mock.callCount(), 3);
  assert.deepEqual(delays, [250, 1000]);
  assert.equal(cancelled, 1);
});

for (const status of [401, 403]) {
  test(`upstream ${status} reaches the browser without retries`, async (t) => {
    let cancelled = 0;
    const { GET, fetch } = makeRoute(t, () => response(status, () => { cancelled++; }),
      () => assert.fail('an authorization error must not be retried'));
    assert.equal((await GET(new Request(origin + '/api/realtime/dashboard'))).status, status);
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(cancelled, 1);
  });
}

test('client abort cancels the failed body and interrupts retry delay', { timeout: 2000 }, async (t) => {
  const controller = new AbortController();
  const sleeping = deferred();
  let cancelled = 0;
  const { GET, fetch } = makeRoute(t, () => response(502, () => { cancelled++; }), (ms, value, options) => {
    assert.equal(ms, 250);
    sleeping.resolve();
    return sleep(30_000, value, options);
  });

  const pending = GET(new Request(origin + '/api/realtime/dashboard', { signal: controller.signal }));
  await Promise.race([sleeping.promise, pending.then(() => assert.fail('Stream did not schedule a retry'))]);
  controller.abort();
  assert.equal((await pending).status, 502);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(cancelled, 1);
});
