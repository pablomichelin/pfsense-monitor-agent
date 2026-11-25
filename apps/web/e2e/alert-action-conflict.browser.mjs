// From apps/web, with Playwright and Chromium available:
// PFS_PLAYWRIGHT_MODULE=/path/to/playwright node e2e/alert-action-conflict.browser.mjs
// PFS_EXPECT_BASELINE=1 verifies the original generic-error behavior.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PFS_PLAYWRIGHT_MODULE ?? 'playwright');
const webDir = fileURLToPath(new URL('..', import.meta.url));
const baseline = process.env.PFS_EXPECT_BASELINE === '1';
const timestamp = '2026-11-25T00:00:00Z';
const client = { id: 'fixture-client', name: 'Cliente sintético', node_count: 1 };
const site = { id: 'fixture-site', name: 'Local sintético', client_id: client.id, client_name: client.name };
const node = { id: 'fixture-node', hostname: 'fixture-firewall', node_uid: 'fixture-uid' };
const initialParams = {
  client_id: client.id, site_id: site.id, node_id: node.id, severity: 'warning',
  type: 'service_down', search: 'VPN & LAN #1', view: 'all', page: '2', per_page: '10',
};
const notice = 'Este alerta já foi alterado. A lista foi atualizada.';
let currentStatus = 'open';
let responseStatus;
const requests = [];
const api = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  let result;
  switch (url.pathname) {
    case '/api/v1/auth/me':
      result = {
        authenticated: true, session: { id: 'fixture' }, has_global_client_scope: true,
        user: { id: 'fixture', email: 'operator@example.invalid', role: 'admin' },
        permissions: ['alerts.view', 'alerts.acknowledge', 'alerts.resolve'],
      };
      break;
    case '/api/v1/nodes/filters':
      result = { clients: [client], sites: [site] };
      break;
    case '/api/v1/alerts': {
      assert.equal(request.method, 'GET');
      requests.push({ kind: 'list', query: Object.fromEntries(url.searchParams), state: currentStatus });
      const alert = {
        id: 'fixture-alert', type: 'service_down', severity: 'warning', status: currentStatus,
        title: 'Ocorrência de teste', description: 'VPN & LAN #1', opened_at: timestamp, node, client, site,
        resolved_at: currentStatus === 'resolved' ? timestamp : null,
        resolution_note: currentStatus === 'resolved' ? 'Operador sintético concluiu' : null,
      };
      result = {
        generated_at: timestamp, total: 25, page: Number(url.searchParams.get('page')), limit: 10, total_pages: 3,
        totals: { open: 0, acknowledged: 0, resolved: 0, critical_pending: 0, critical_resolved: 0 },
        items: [alert],
      };
      break;
    }
    case '/api/v1/alerts/fixture-alert/acknowledge':
    case '/api/v1/alerts/fixture-alert/resolve': {
      assert.equal(request.method, 'POST');
      assert.equal(request.headers['x-csrf-token'], 'synthetic-csrf');
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const action = url.pathname.split('/').at(-1);
      requests.push({ kind: 'mutation', action, body: JSON.parse(raw) });
      response.statusCode = responseStatus;
      if (responseStatus === 409) {
        currentStatus = 'resolved';
        result = {
          message: action === 'resolve' ? 'alert already resolved' : 'resolved alert cannot be acknowledged',
        };
      } else if (responseStatus === 200) {
        currentStatus = action === 'resolve' ? 'resolved' : 'acknowledged';
        result = { status: currentStatus };
      } else {
        result = { message: `Erro sintético ${responseStatus}` };
      }
      break;
    }
    default:
      response.statusCode = 404;
      result = { message: 'Fixture endpoint not found' };
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(result));
});

await new Promise((done) => api.listen(0, '127.0.0.1', done));
const tempDir = await mkdtemp(join(tmpdir(), 'pfs-alert-browser-'));
const fonts = join(tempDir, 'fonts.cjs');
await writeFile(fonts, "module.exports = new Proxy({}, { get: () => '@font-face { font-family: Fixture; src: local(Fixture); }' });\n");
const next = spawn(process.execPath, [join(webDir, 'node_modules/next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', '0'], {
  cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    MONITOR_API_BASE_URL: `http://127.0.0.1:${api.address().port}`,
    MONITOR_AUTH_CSRF_COOKIE_NAME: 'monitor_pfsense_csrf',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fonts,
  },
});
const exited = once(next, 'exit');
let logs = '';
let browser;

try {
  const baseUrl = await new Promise((done, fail) => {
    const timeout = setTimeout(() => fail(new Error('Next did not start')), 30000);
    next.stdout.on('data', (chunk) => {
      logs += chunk;
      const url = logs.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && logs.includes('Ready in')) {
        clearTimeout(timeout);
        done(url);
      }
    });
    next.stderr.on('data', (chunk) => { logs += chunk; });
    next.once('exit', (status) => {
      clearTimeout(timeout);
      fail(new Error(`Next exited with status ${status}`));
    });
  });
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== baseUrl || url.pathname === '/api/realtime/dashboard') return route.abort();
    return route.continue();
  });
  await context.addCookies([
    { name: 'monitor_pfsense_session', value: 'synthetic', url: baseUrl },
    { name: 'monitor_pfsense_csrf', value: 'synthetic-csrf', url: baseUrl },
  ]);

  const cases = [
    ['acknowledge', 409], ['resolve', 409], ['acknowledge', 401],
    ['resolve', 403], ['acknowledge', 500], ['acknowledge', 200], ['resolve', 200],
  ];
  for (const [action, httpStatus] of cases) {
    currentStatus = 'open';
    responseStatus = httpStatus;
    requests.length = 0;
    const page = await context.newPage();
    const url = `${baseUrl}/alerts?${new URLSearchParams(initialParams)}`;
    assert.equal((await page.goto(url, { waitUntil: 'networkidle' })).status(), 200);
    const button = page.getByRole('button', { name: action === 'resolve' ? 'Resolver' : 'Reconhecer', exact: true });
    if (action === 'resolve') await page.getByLabel('Nota de resolução do alerta').fill('  Nota sintética  ');
    await button.click();

    const isHandled = httpStatus === 200 || (httpStatus === 409 && !baseline);
    if (isHandled) {
      const expected = httpStatus === 409 ? { ...initialParams, alert_notice: 'changed' } : initialParams;
      const expectedState = httpStatus === 409 || action === 'resolve' ? 'resolved' : 'acknowledged';
      const state = expectedState === 'resolved' ? 'Resolvido' : 'Reconhecido';
      if (httpStatus === 409) {
        await page.getByRole('alert').filter({ hasText: notice }).waitFor();
      } else {
        await page.locator('main span').getByText(state, { exact: true }).first().waitFor();
        assert.equal(await page.getByText(notice, { exact: true }).count(), 0);
      }
      const actual = new URL(page.url());
      assert.equal(actual.pathname, '/alerts');
      assert.deepEqual(Object.fromEntries(actual.searchParams), expected);
      assert.equal(await page.getByText('Página 2 de 3', { exact: true }).isVisible(), true);
      assert.equal(await page.locator('main span').getByText(state, { exact: true }).first().isVisible(), true);
      assert.equal(await page.getByRole('heading', { name: 'Algo deu errado' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Reconhecer', exact: true }).count(), 0);
      if (expectedState === 'resolved') {
        assert.equal(await page.getByRole('button', { name: 'Resolver', exact: true }).count(), 0);
      }
      const mutationIndex = requests.findIndex(({ kind }) => kind === 'mutation');
      const read = requests.slice(mutationIndex + 1).find(({ kind, state }) => kind === 'list' && state === expectedState);
      assert.ok(read, 'GET after the mutation must read the current state');
      const { view, per_page, ...apiFilters } = initialParams;
      assert.deepEqual(read.query, { ...apiFilters, limit: per_page, sort_by: 'attention' });
      assert.equal(new URL(await page.getByRole('link', { name: 'Próxima' }).getAttribute('href'), baseUrl).searchParams.has('alert_notice'), false);
      for (const formReturn of await page.locator('input[name="return_to"]').evaluateAll((inputs) => inputs.map(({ value }) => value))) {
        assert.equal(new URL(formReturn, baseUrl).searchParams.has('alert_notice'), false);
      }
      console.log(`${action} HTTP ${httpStatus}: /alerts página 2, GET ${expectedState}, aviso ${httpStatus === 409}`);
    } else {
      await page.getByRole('heading', { name: 'Algo deu errado' }).waitFor();
      assert.equal(await page.getByText(notice, { exact: true }).count(), 0);
      assert.equal(page.url(), url);
      console.log(`${action} HTTP ${httpStatus}: tela genérica preservada`);
    }
    assert.deepEqual(requests.filter(({ kind }) => kind === 'mutation'), [{
      kind: 'mutation', action, body: action === 'resolve' ? { resolution_note: 'Nota sintética' } : {},
    }]);
    await page.close();
  }
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  next.kill('SIGTERM');
  await exited;
  await new Promise((done) => api.close(done));
  await rm(tempDir, { recursive: true, force: true });
}
