import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server.js';
import { deferred, sourceLoader } from './source-harness.mjs';

const base = 'https://qa.example.test';

function middleware(t, name = '') {
  const env = {
    MONITOR_API_BASE_URL: 'https://api.example.test',
    MONITOR_AUTH_SESSION_COOKIE_NAME: name,
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  return sourceLoader()('middleware.ts').middleware;
}

test('middleware recognizes the configured session cookie name', async (t) => {
  const next = middleware(t, 'pfs_qa_session');
  const cookie = 'pfs_qa_session=synthetic-session';
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.example.test/api/v1/auth/me');
    assert.equal(options.headers.cookie, cookie);
    return Response.json({ authenticated: true, user: { role: 'readonly' }, permissions: ['firewalls.view'] });
  });
  const response = await next(new NextRequest(base + '/nodes', { headers: { cookie } }));
  assert.equal(response.status, 200);
  assert.equal(fetch.mock.callCount(), 1);
});

test('session redirect preserves the filtered URL and ignores similarly named cookies', async (t) => {
  const next = middleware(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 401 }));
  const path = '/nodes?status=offline&search=QA+North';
  const response = await next(new NextRequest(base + path, {
    headers: { cookie: 'other_monitor_pfsense_session=qa-fixture' },
  }));
  const redirected = new URL(response.headers.get('location'));
  assert.equal(redirected.pathname, '/login');
  assert.equal(redirected.searchParams.get('next'), path);
  assert.equal(fetch.mock.callCount(), 0);
});

test('a stalled session check produces a bounded fail-closed response', async (t) => {
  const next = middleware(t);
  const deadline = new AbortController();
  const alarm = t.mock.method(AbortSignal, 'timeout', (ms) => {
    assert.equal(ms, 8000);
    return deadline.signal;
  });
  const entered = deferred();
  const check = deferred();
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    signal?.addEventListener('abort', () => check.reject(signal.reason), { once: true });
    entered.resolve();
    return check.promise;
  });

  const pending = next(new NextRequest(base + '/nodes', {
    headers: { cookie: 'monitor_pfsense_session=qa-fixture' },
  }));
  await entered.promise;
  deadline.abort();
  if (!alarm.mock.callCount()) check.reject(new Error('fixture releases a stalled request'));
  const response = await pending;
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '30');
  assert.equal(alarm.mock.callCount(), 1);
});
