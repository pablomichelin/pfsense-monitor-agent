import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, elements, textOf, deferred, settle, hookHarness } from './source-harness.mjs';

const load = sourceLoader();
const { interpretTableTarget, tableTargetInput } = load('lib/table-ip.ts');
const { parsePage, currentAlertPage } = load('lib/pagination.ts');

test('IPv4 mantém rede canônica; IPv6 /128 segue contrato sem CIDR', () => {
  assert.deepEqual(interpretTableTarget('203.0.113.59/24', 32), { address: '203.0.113.59', target: '203.0.113.0/24', prefix: 24 });
  for (const address of ['2001:db8::1', '::1', '::ffff:192.0.2.1']) {
    assert.deepEqual(interpretTableTarget(`${address}/128`, 32), { address, target: address, prefix: 128 });
    assert.equal(tableTargetInput(address, 24).prefix, 128);
  }
  assert.equal(interpretTableTarget('[2001:db8::1]:443', 128).target, '2001:db8::1');
  assert.equal(tableTargetInput('203.0.113.8', 128).prefix, 32);
  for (const [ip, mask] of [['2001:db8::1', 32], ['2001:db8::1/64', 128], ['203.0.113.1/128', 32], ['203.0.113.1/0', 32], ['fe80::1%eth0', 128], ['999.0.0.1', 32]]) {
    assert.ok('error' in interpretTableTarget(ip, mask), `${ip}/${mask}`);
  }
});

test('paginação rejeita Infinity, números inseguros e preserva limites', () => {
  for (const value of ['9'.repeat(400), '9007199254740992', '0', '-2', '1.5', ['2'], undefined]) assert.equal(parsePage(value), 1);
  assert.equal(parsePage('12'), 12);
  assert.equal(currentAlertPage(12, 51, 25), 3);
  assert.equal(currentAlertPage(2, 0, 25), 1);
});

function redirect(url) {
  const error = new Error('NEXT_REDIRECT');
  error.url = url;
  throw error;
}

test('token é retornado pela action, sem redirect/URL; erro não reflete segredo', async () => {
  const calls = [];
  let fail = false;
  const token = 'SYNTHETIC_SECRET_NOT_A_CREDENTIAL';
  const admin = sourceLoader({
    '@/lib/api': {},
    './api': { createAgentToken: async (...args) => { calls.push(args); if (fail) throw new Error(token); return { token: { agent_token: token, token_hint: 'synthetic' } }; } },
    'next/cache': { revalidatePath: () => {} },
    'next/navigation': { redirect: (url) => assert.fail(`Redirect indevido: ${url}`) },
    'next/dist/client/components/redirect-error': { isRedirectError: () => false },
  })('lib/admin.ts');
  const form = new FormData();
  assert.deepEqual(await admin.createAgentTokenAction(form), { ok: false, error: 'Selecione um firewall.' });
  assert.equal(calls.length, 0);
  form.set('node_id', 'node-21');
  const result = await admin.createAgentTokenAction(form);
  assert.deepEqual(result, { ok: true, token, hint: 'synthetic' });
  fail = true;
  const failure = await admin.createAgentTokenAction(form);
  assert.equal(failure.ok, false);
  assert.ok(!JSON.stringify(failure).includes(token));
});

test('formulário oferece firewall 21/240 e limpa credencial ao ocultar/trocar alvo', async () => {
  const harness = hookHarness();
  const token = 'SYNTHETIC_EPHEMERAL';
  const { AgentTokenForm } = sourceLoader({ ...uiMocks, react: harness.react,
    '@/lib/admin': { createAgentTokenAction: async () => ({ ok: true, token, hint: 'fake' }) },
    '@/lib/use-paged-nodes': { usePagedNodes: () => ({ loading: false, result: { items: Array.from({ length: 240 }, (_, i) => ({ id: `node-${i + 1}`, node_uid: `fw-${i + 1}`, client: { code: 'TEST' } })) } }) },
    '@/components/node-browser-controls': { NodeBrowserControls: 'node-browser' },
  })('components/agent-token-form.tsx');
  const props = { nodes: Array.from({ length: 240 }, (_, i) => ({ id: `node-${i + 1}`, node_uid: `fw-${i + 1}`, client: { code: 'TEST' } })) };
  let tree = harness.render(AgentTokenForm, props);
  assert.equal(elements(tree).filter((e) => e.type === 'option').length, 241);
  const submit = () => { const form = new FormData(); form.set('node_id', 'node-21'); return elements(tree).find((e) => e.type === 'form').props.action(form); };
  await submit();
  tree = harness.render(AgentTokenForm, props);
  assert.ok(textOf(tree).includes(token));
  elements(tree).find((e) => e.type === 'button' && textOf(e) === 'Ocultar token').props.onClick();
  tree = harness.render(AgentTokenForm, props);
  assert.ok(!textOf(tree).includes(token));
  await submit();
  tree = harness.render(AgentTokenForm, props);
  elements(tree).find((e) => e.type === 'select').props.onChange({ target: { value: 'node-22' } });
  assert.ok(!textOf(harness.render(AgentTokenForm, props)).includes(token));
});

function alertFixture(id, status = 'open') {
  return { id, status, severity: 'warning', title: 'Synthetic alert', description: '', type: 'service_down', opened_at: '2026-10-01T10:00:00Z', node: { id: 'node', hostname: 'synthetic', node_uid: 'fake' }, client: { name: 'Synthetic' }, site: { name: 'Lab' } };
}

test('alertas mostram somente ações autorizadas e preservam página/filtros', async () => {
  for (const granted of [[], ['alerts.acknowledge'], ['alerts.resolve'], ['alerts.acknowledge', 'alerts.resolve']]) {
    const page = sourceLoader({ ...uiMocks,
      '@/lib/alerts': { acknowledgeAlertAction: () => {}, resolveAlertAction: () => {} },
      '@/lib/api': { getSession: async () => ({ permissions: ['alerts.view', ...granted] }), getNodesFilters: async () => ({ clients: [], sites: [] }), getAlertsList: async () => ({ generated_at: '2026-10-01', total: 30, page: 2, limit: 25, total_pages: 2, totals: { open: 30, acknowledged: 0, critical: 0 }, items: Array.from({ length: 5 }, (_, i) => alertFixture(`a-${i + 25}`)) }) },
      'next/navigation': { redirect },
    })('app/alerts/page.tsx').default;
    const tree = await page({ searchParams: Promise.resolve({ page: '2', per_page: '25', client_id: 'synthetic-client' }) });
    const actionForms = elements(tree).filter((e) => e.type?.name === 'ActionForms').map((e) => e.type(e.props));
    assert.equal(actionForms.length, 5);
    const buttons = actionForms.flatMap(elements).filter((e) => e.type === 'button').map(textOf);
    assert.equal(buttons.includes('Reconhecer'), granted.includes('alerts.acknowledge'));
    assert.equal(buttons.includes('Resolver'), granted.includes('alerts.resolve'));
    const returns = actionForms.flatMap(elements).filter((e) => e.props?.name === 'return_to');
    for (const input of returns) {
      const url = new URL(input.props.value, 'https://synthetic.invalid');
      assert.equal(url.searchParams.get('page'), '2');
      assert.equal(url.searchParams.get('per_page'), '25');
      assert.equal(url.searchParams.get('client_id'), 'synthetic-client');
    }
  }
});

test('usuários sem gestão permanecem somente leitura e sessões são carregadas sob demanda', async () => {
  for (const canManageUsers of [false, true]) {
    const harness = hookHarness();
    const { AdminUsuariosTabs } = sourceLoader({ ...uiMocks, react: harness.react,
      '@/lib/admin': {}, '@/components/role-scope-fields': { RoleScopeFields: 'role-fields' },
      '@/components/confirm-dialog': { ConfirmDialog: 'dialog' },
      '@/lib/admin-user-sessions-actions': { getAdminUserSessionsAction: async () => ({ ok: true, items: [{ id: 'session', current: false, created_at: '2026-10-01', expires_at: '2099-01-01T00:00:00Z', revoked_at: null, ip_address: null, last_seen_at: null, user_agent: null }] }) },
    })('components/admin-usuarios-tabs.tsx');
    const props = { users: [{ id: 'user', email: 'synthetic@example.invalid', role: 'readonly', status: 'active', client_ids: [] }], clients: [], roles: [], canManageUsers, initialUserId: 'user', SectionMessage: 'message' };
    let tree = harness.render(AdminUsuariosTabs, props);
    assert.equal(elements(tree).some((e) => e.type === 'form'), canManageUsers);
    assert.equal(textOf(tree).includes('Excluir usuário'), canManageUsers);
    assert.equal(elements(tree).some((e) => e.props?.name === 'password'), canManageUsers);
    elements(tree).find((e) => e.type === 'button' && textOf(e) === 'Sessões').props.onClick();
    tree = harness.render(AdminUsuariosTabs, props);
    await settle();
    tree = harness.render(AdminUsuariosTabs, props);
    assert.equal(textOf(tree).includes('Revogar'), canManageUsers);
  }
});

function pfHarness(t, overrides = {}) {
  const harness = hookHarness();
  const timers = new Map();
  let timerId = 0;
  t.mock.method(globalThis, 'setInterval', (fn) => { timers.set(++timerId, fn); return timerId; });
  t.mock.method(globalThis, 'clearInterval', (id) => timers.delete(id));
  const { FleetPfTablesPanel } = sourceLoader({ ...uiMocks, react: harness.react,
    '@/lib/operational-actions-actions': { requestTableSearchAction: async () => ({ ok: true, command_id: 'cmd', status: 'pending' }), requestTableListAction: async () => ({ ok: true, command_id: 'list', status: 'pending' }), requestTableEntryRemoveAction: () => assert.fail('Nenhuma remoção esperada'), ...overrides.actions },
    '@/lib/node-commands-actions': { fetchNodeCommandDetail: async () => ({ command: { status: 'succeeded', result_json: { tables: ['sshlockout', 'ips_liberados'] } } }), ...overrides.poll },
    '@/components/nodes/node-command-progress': { commandStatusLabel: (s) => s },
  })('components/nodes/fleet-pf-tables-panel.tsx');
  const props = { selectedNodes: [{ id: 'node', hostname: 'synthetic', display_name: null, agent_version: '0.5.25' }] };
  const child = FleetPfTablesPanel(props);
  let tree;
  const render = () => tree = harness.render(child.type, child.props);
  const inputIp = (value) => { elements(tree).find((e) => e.type === 'input' && e.props.placeholder).props.onChange({ target: { value } }); render(); };
  const click = (label) => elements(tree).find((e) => e.type === 'button' && textOf(e).includes(label)).props.onClick();
  render();
  return { harness, render, inputIp, click, timers, get tree() { return tree; }, FleetPfTablesPanel, props };
}

test('pf tables: resposta tardia da consulta não reaparece após editar IP', async (t) => {
  const response = deferred();
  const pf = pfHarness(t, { actions: { requestTableSearchAction: () => response.promise } });
  pf.inputIp('203.0.113.1');
  pf.click('Consultar');
  pf.render();
  pf.inputIp('203.0.113.2');
  response.resolve({ ok: true, command_id: 'old-cmd', status: 'pending' });
  await settle();
  assert.ok(!textOf(pf.render()).includes('pending'));
  assert.equal(pf.timers.size, 0);
});

test('pf tables: polling antigo não repõe matches após mudar máscara; allow table excluída', async (t) => {
  const poll = deferred();
  const pf = pfHarness(t, { poll: { fetchNodeCommandDetail: () => poll.promise } });
  pf.inputIp('203.0.113.1');
  pf.click('Consultar');
  await settle();
  pf.render();
  assert.equal(pf.timers.size, 1);
  [...pf.timers.values()][0]();
  elements(pf.tree).find((e) => e.type === 'select').props.onChange({ target: { value: '24' } });
  pf.render();
  poll.resolve({ command: { status: 'succeeded', result_json: { tables: ['sshlockout'] } } });
  await settle();
  assert.ok(!textOf(pf.render()).includes('1 tabela(s) de bloqueio'));
  assert.equal(elements(pf.tree).filter((e) => e.props?.type === 'checkbox').length, 0);
});

test('pf tables: IPv6 é consultado com /128; sucesso mantém somente tabelas de bloqueio', async (t) => {
  const args = [];
  const pf = pfHarness(t, { actions: { requestTableSearchAction: async (...a) => { args.push(a); return { ok: true, command_id: 'cmd', status: 'pending' }; } } });
  pf.inputIp('2001:db8::8/128');
  pf.click('Consultar');
  await settle();
  pf.render();
  assert.deepEqual(args, [['node', '2001:db8::8', 128]]);
  [...pf.timers.values()][0]();
  await settle();
  const tree = pf.render();
  assert.ok(textOf(tree).includes('sshlockout'));
  const checks = elements(tree).filter((e) => e.props?.type === 'checkbox');
  assert.equal(checks.length, 1);
  const first = pf.FleetPfTablesPanel(pf.props);
  const changed = pf.FleetPfTablesPanel({ selectedNodes: [{ ...pf.props.selectedNodes[0], id: 'other-node' }] });
  assert.notEqual(first.key, changed.key);
  pf.harness.unmount();
  assert.equal(pf.timers.size, 0);
});

test('SSE distingue conexão/reconexão/fim, filtra node e mantém refresh final no throttle', (t) => {
  const harness = hookHarness();
  let source;
  class FakeEventSource {
    static CLOSED = 2;
    readyState = 0;
    listeners = new Map();
    constructor(url) { assert.equal(url, '/api/realtime/dashboard'); source = this; }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    removeEventListener(name) { this.listeners.delete(name); }
    close() { this.readyState = 2; }
    emit(name, payload) { this.listeners.get(name)?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) }); }
  }
  const oldSource = globalThis.EventSource;
  const oldWindow = globalThis.window;
  globalThis.EventSource = FakeEventSource;
  t.after(() => { if (oldSource === undefined) delete globalThis.EventSource; else globalThis.EventSource = oldSource; if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; });
  let now = 1_000_000;
  let id = 0;
  const timers = new Map();
  globalThis.window = { setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; }, clearTimeout: (id) => timers.delete(id) };
  t.mock.method(Date, 'now', () => now);
  let refreshed = 0;
  const router = { refresh: () => refreshed++ };
  const { RealtimeRefresh } = sourceLoader({ react: harness.react, 'next/navigation': { useRouter: () => router } })('components/realtime-refresh.tsx');
  const render = () => harness.render(RealtimeRefresh, { scope: 'node', nodeId: 'node' });
  assert.match(textOf(render()), /conectando/);
  source.readyState = 1;
  source.emit('open');
  source.emit('connected');
  assert.match(textOf(render()), /ativo/);
  assert.equal(timers.size, 1, 'primeira conexão recupera a janela do snapshot');
  const payload = { node_id: 'node', source: 'heartbeat_ingested', occurred_at: '2026-10-01T10:00:00Z' };
  source.emit('dashboard.refresh', { ...payload, node_id: 'other' });
  source.emit('dashboard.refresh', { ...payload, occurred_at: 'invalid' });
  source.emit('dashboard.refresh', 'invalid json');
  assert.equal(timers.size, 1, 'eventos inválidos não duplicam a atualização inicial');
  source.emit('dashboard.refresh', payload);
  const fireTimer = () => { const [key, timer] = [...timers.entries()][0]; timers.delete(key); now += timer.delay; timer.fn(); };
  assert.equal([...timers.values()][0].delay, 1200);
  fireTimer();
  assert.equal(refreshed, 1);
  now += 1000;
  source.emit('dashboard.refresh', payload);
  assert.equal([...timers.values()][0].delay, 29000);
  source.emit('dashboard.refresh', payload);
  assert.equal(timers.size, 1);
  fireTimer();
  assert.equal(refreshed, 2);
  source.readyState = 0;
  source.emit('error');
  assert.match(textOf(render()), /reconectando/);
  source.readyState = 1;
  source.emit('open');
  assert.equal(timers.size, 1, 'reconexão agenda recuperação de eventos perdidos');
  source.readyState = 2;
  source.emit('error');
  assert.match(textOf(render()), /desconectado/);
  harness.unmount();
  assert.equal(timers.size, 0);
  assert.equal(source.listeners.size, 0);
});

test('proxy SSE recusa JSON/erro upstream e preserva status 401', async (t) => {
  const originalBase = process.env.MONITOR_API_BASE_URL;
  process.env.MONITOR_API_BASE_URL = 'https://synthetic.invalid';
  t.after(() => { if (originalBase === undefined) delete process.env.MONITOR_API_BASE_URL; else process.env.MONITOR_API_BASE_URL = originalBase; });
  let response;
  t.mock.method(globalThis, 'fetch', async (url) => { assert.equal(url, 'https://synthetic.invalid/api/v1/dashboard/events'); if (response instanceof Error) throw response; return response; });
  const { GET } = sourceLoader({ 'next/headers': { headers: async () => new Headers() } })('app/api/realtime/dashboard/route.ts');
  const request = new Request('https://synthetic.invalid/api/realtime/dashboard');
  response = new Response('{}', { headers: { 'content-type': 'application/json' } });
  assert.equal((await GET(request)).status, 502);
  response = new Response('denied', { status: 401 });
  assert.equal((await GET(request)).status, 401);
  response = new Error('Synthetic network failure');
  assert.equal((await GET(request)).status, 502);
  response = new Response('event: connected\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
  const streamed = await GET(request);
  assert.equal(streamed.status, 200);
  assert.match(await streamed.text(), /event: connected/);
});

test('técnico restrito mantém operações por firewall, sem cadastro global; carga não vira vazio', async () => {
  for (const canManageRegistry of [false, true]) {
    const harness = hookHarness();
    const list = deferred();
    const { FleetTechnicianManagementPanel } = sourceLoader({ ...uiMocks, react: harness.react,
      '@/lib/technicians': { listTechniciansAction: () => list.promise },
    })('components/nodes/fleet-technician-management-panel.tsx');
    const props = { nodeIds: ['node'], mode: 'selection', canManageTechnicians: true, canManageRegistry, canResetTechnicianPassword: true };
    let tree = harness.render(FleetTechnicianManagementPanel, props);
    assert.match(textOf(tree), /Carregando técnicos/);
    assert.ok(!textOf(tree).includes('Nenhum técnico cadastrado'));
    list.resolve({ items: [{ id: 'tech', full_name: 'Synthetic', login_username: 'synthetic', status: 'active', node_account_count: 1 }] });
    await settle();
    tree = harness.render(FleetTechnicianManagementPanel, props);
    assert.equal(textOf(tree).includes('+ Novo técnico'), canManageRegistry);
    assert.match(textOf(tree), /Provisionar/);
    assert.match(textOf(tree), /Alterar senha/);
    assert.equal(textOf(tree).includes('primeiro vínculo'), !canManageRegistry);
    elements(tree).find((e) => e.type === 'button' && textOf(e) === 'Técnicos').props.onClick();
    tree = harness.render(FleetTechnicianManagementPanel, props);
    assert.equal(textOf(tree).includes('Remover do cadastro'), canManageRegistry);
  }
  const harness = hookHarness();
  const { FleetTechnicianManagementPanel } = sourceLoader({ ...uiMocks, react: harness.react,
    '@/lib/technicians': { listTechniciansAction: async () => { throw new Error('Synthetic load failure'); } },
  })('components/nodes/fleet-technician-management-panel.tsx');
  const props = { nodeIds: [], canManageTechnicians: true, canManageRegistry: false, canResetTechnicianPassword: false };
  harness.render(FleetTechnicianManagementPanel, props);
  await settle();
  const tree = harness.render(FleetTechnicianManagementPanel, props);
  assert.match(textOf(tree), /Falha ao carregar lista/);
  assert.match(textOf(tree), /Lista de técnicos indisponível/);
  assert.ok(!textOf(tree).includes('Nenhum técnico visível'));
});

test('admin técnicos calcula cadastro apenas com escopo global explícito + manage', async () => {
  for (const globalScope of [undefined, false, true]) {
    for (const manage of [false, true]) {
      const perms = ['technicians.view', 'technicians.password_reset.run', ...(manage ? ['technicians.manage'] : [])];
      const page = sourceLoader({ ...uiMocks,
        '@/components/admin-technician-targets': { AdminTechnicianTargets: 'technicians-panel' },
        '@/lib/api': { getSession: async () => ({ permissions: perms, has_global_client_scope: globalScope }), getTechnicians: async () => ({ items: [] }), getNodesList: async () => ({ items: [{ id: 'node' }] }) },
        'next/navigation': { redirect },
      })('app/admin/tecnicos/page.tsx').default;
      const tree = await page();
      const panel = elements(tree).find((e) => e.type === 'technicians-panel');
      assert.equal(panel.props.canManageRegistry, globalScope === true && manage);
      assert.equal(panel.props.canManageTechnicians, manage);
      assert.equal(panel.props.canResetTechnicianPassword, true);
    }
  }
});

test('detalhe do firewall distingue falha de carga de histórico vazio/desligado e repropaga 401', async () => {
  class ApiError extends Error { constructor(status) { super('Synthetic API failure'); this.status = status; } }
  const node = { id: 'node', hostname: 'synthetic', client: { id: 'client', name: 'Synthetic' }, site: { name: 'Lab' }, effective_status: 'online', node_uid: 'synthetic', last_seen_at: null, node_accounts: [] };
  const componentMocks = {};
  for (const [file, symbol] of [
    ['delete-node-button', 'DeleteNodeButton'], ['nodes/node-command-history-panel', 'NodeCommandHistoryPanel'], ['nodes/node-operational-actions-section', 'NodeOperationalActionsSection'], ['nodes/node-detail-alerts-tab', 'NodeDetailAlertsTab'], ['nodes/node-detail-backup-tab', 'NodeDetailBackupTab'], ['nodes/node-detail-config-tab', 'NodeDetailConfigTab'], ['nodes/node-detail-metrics-tab', 'NodeDetailMetricsTab'], ['nodes/node-detail-overview-tab', 'NodeDetailOverviewTab'], ['nodes/node-detail-tabs', 'NodeDetailTabs'], ['nodes/node-technician-accounts-panel', 'NodeTechnicianAccountsPanel'],
  ]) componentMocks[`@/components/${file}`] = { [symbol]: symbol };
  for (const failureStatus of [null, 500, 401]) {
    const api = {
      ApiError, getNodeDetails: async () => ({ node }), getSession: async () => ({ user: { role: 'readonly' }, permissions: [] }),
      getNodeConfigBackups: async () => ({}), getPfsenseUpgradeStatus: async () => ({}), getPackageUpgradeStatus: async () => ({}),
      getNodeMetricsHistory: async () => { if (failureStatus) throw new ApiError(failureStatus); return { enabled: false, points: [] }; },
      getNodeCommandHistory: async () => { if (failureStatus === 500) throw new ApiError(500); return { items: [] }; },
      getOperationalActionsStatus: async () => ({ enabled: false }),
    };
    const page = sourceLoader({ ...uiMocks, ...componentMocks, '@/lib/api': api, 'next/navigation': { redirect, notFound: () => assert.fail('404 indevido') } })('app/nodes/[id]/page.tsx').default;
    const invocation = () => page({ params: Promise.resolve({ id: 'node' }), searchParams: Promise.resolve({}) });
    if (failureStatus === 401) {
      await assert.rejects(invocation, (error) => error.url === '/login');
      continue;
    }
    const tree = await invocation();
    const tabs = elements(tree).find((e) => e.type === 'NodeDetailTabs');
    assert.equal(textOf(tree).includes('Não foi possível carregar'), failureStatus === 500);
    assert.equal(tabs.props.metrics.type, 'NodeDetailMetricsTab');
    assert.equal(tabs.props.metrics.props.metricsHistory === null, failureStatus === 500);
    assert.equal(elements(tabs.props.overview).some((e) => e.type === 'NodeCommandHistoryPanel'), failureStatus !== 500);
  }
});

test('falha do histórico preserva snapshot e serviços na aba de métricas', () => {
  const { NodeDetailMetricsTab } = sourceLoader({ ...uiMocks,
    '@/components/nodes/node-detail-ui': { Metric: 'metric' },
    '@/components/nodes/node-metrics-trends-panel': { NodeMetricsTrendsPanel: 'trends' },
    '@/components/ui/page-section': { PageSection: 'section' },
  })('components/nodes/node-detail-metrics-tab.tsx');
  const tree = NodeDetailMetricsTab({ node: { id: 'synthetic', latest_heartbeat: { cpu_percent: 10 }, services: [] }, metricsHistory: null, metricsPeriod: '24h' });
  assert.equal(elements(tree).filter((e) => e.type === 'metric').length, 4);
  assert.match(textOf(tree), /Não foi possível carregar o histórico/);
  assert.ok(!elements(tree).some((e) => e.type === 'trends'));
});

test('cadastro inicial restringe criação de usuários ao superadmin e pede uma página de 50 firewalls', async () => {
  for (const role of ['superadmin', 'admin', 'operator']) {
    let query;
    const page = sourceLoader({ ...uiMocks,
      '@/components/admin-cadastro-cards': { AdminCadastroCards: 'registration-cards' },
      '@/lib/api': {
        getSession: async () => ({ user: { role }, permissions: ['inventory.global', 'users.view', 'users.create'] }),
        getNodesFilters: async () => ({ clients: [], sites: [] }),
        getNodesList: async (value) => { query = value; return { items: [] }; },
        getRolesList: async () => ({ items: [] }),
      },
      'next/navigation': { redirect },
    })('app/admin/page.tsx').default;
    const tree = await page({});
    assert.equal(elements(tree).find((e) => e.type === 'registration-cards').props.canManageUsers, role === 'superadmin');
    assert.equal(query.limit, 50);
  }
});

test('técnico com apenas reset de senha começa em reset, sem provisionamento/cadastro', async () => {
  const harness = hookHarness();
  const { FleetTechnicianManagementPanel } = sourceLoader({ ...uiMocks, react: harness.react,
    '@/lib/technicians': { listTechniciansAction: async () => ({ items: [{ id: 'tech', full_name: 'Synthetic', login_username: 'synthetic', status: 'active', node_account_count: 1 }] }) },
  })('components/nodes/fleet-technician-management-panel.tsx');
  const props = { nodeIds: ['node'], canManageTechnicians: false, canManageRegistry: true, canResetTechnicianPassword: true };
  harness.render(FleetTechnicianManagementPanel, props);
  await settle();
  const tree = harness.render(FleetTechnicianManagementPanel, props);
  const buttons = elements(tree).filter((e) => e.type === 'button').map(textOf);
  assert.ok(buttons.some((text) => text.includes('Alterar senha')));
  assert.ok(!buttons.some((text) => text.includes('Provisionar') || text.includes('Novo técnico') || text.includes('Remover')));
});
