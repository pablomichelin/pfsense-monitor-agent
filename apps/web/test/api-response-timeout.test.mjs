import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, sourceLoader } from './source-harness.mjs';

function loadApi() {
  const previous = process.env.MONITOR_API_BASE_URL;
  process.env.MONITOR_API_BASE_URL = 'https://qa.example.test';
  try {
    return sourceLoader({
      'next/headers': { headers: async () => new Headers() },
    })('lib/api.ts');
  } finally {
    if (previous === undefined) delete process.env.MONITOR_API_BASE_URL;
    else process.env.MONITOR_API_BASE_URL = previous;
  }
}

test('audit dates fall back to an inclusive limit only for an older API', async (t) => {
  const requests = [];
  const unsupported = { message: ['property to_before should not exist'] };
  t.mock.method(globalThis, 'fetch', async (rawUrl) => {
    const url = new URL(rawUrl);
    requests.push(url);
    return requests.length === 1
      ? Response.json(unsupported, { status: 400 })
      : Response.json({ items: [] });
  });
  const { getAuditLogs } = loadApi();
  const bounds = { from: '2026-11-25T03:00:00.000Z', to_before: '2026-11-26T03:00:00.000Z' };
  assert.deepEqual(await getAuditLogs({ action: 'auth.', ...bounds }), { items: [] });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('to_before'), bounds.to_before);
  assert.equal(requests[1].searchParams.has('to_before'), false);
  assert.equal(requests[1].searchParams.get('to'), '2026-11-26T02:59:59.999Z');
  assert.equal(requests[1].searchParams.get('from'), bounds.from);
  assert.equal(requests[1].searchParams.get('action'), 'auth.');
});

for (const status of [200, 503]) {
  test(`API deadline covers a stalled body after HTTP ${status} headers`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const started = deferred();
    const body = deferred();
    let signal;
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.equal(url, 'https://qa.example.test/api/v1/dashboard/summary');
      signal = init.signal;
      signal.addEventListener('abort', () => body.reject(signal.reason), { once: true });
      return {
        ok: status === 200,
        status,
        json: () => { started.resolve(); return body.promise; },
      };
    });
    const { getDashboardSummary, ApiError } = loadApi();
    const pending = getDashboardSummary().catch((error) => error);
    await started.promise;
    t.mock.timers.tick(28_000);
    if (!signal.aborted) body.resolve({ message: 'fixture released after checking the deadline' });
    const result = await pending;
    assert.equal(signal.aborted, true);
    assert.ok(result instanceof ApiError);
    assert.equal(result.status, 408);
  });
}

test('an ordinary API error body preserves its HTTP status and code', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    message: { message: 'synthetic interruption', code: 'QA' },
  }, { status: 503 }));
  const { getDashboardSummary, ApiError } = loadApi();
  await assert.rejects(getDashboardSummary(), (error) =>
    error instanceof ApiError && error.status === 503 && error.code === 'QA'
    && error.message === 'synthetic interruption');
});
