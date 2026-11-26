import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, hookHarness, elements, textOf, deferred, settle } from './source-harness.mjs';

const findButton = (tree, label) => elements(tree).find((e) => e.type === 'button' && textOf(e).replace(/\s+/g, ' ').trim().includes(label));

test('account settings wait for an actual MFA status and offer a retry after a failed read', async (t) => {
  const hooks = hookHarness();
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (path) => {
    assert.equal(path, '/api/mfa/status');
    reads += 1;
    return reads === 1
      ? Response.json({ message: 'synthetic outage' }, { status: 503 })
      : Response.json({ enabled: true, recovery_codes_remaining: 8, enforcement_required: false, enrolled_at: null });
  });
  const { MfaSection } = sourceLoader({ ...uiMocks, react: hooks.react })('app/conta/mfa-section.tsx');
  const render = () => hooks.render(MfaSection);
  assert.equal(findButton(render(), 'Ativar verificação em duas etapas'), undefined);
  await settle();
  const unavailable = render();
  assert.match(textOf(unavailable), /Não foi possível consultar o status/);
  assert.equal(findButton(unavailable, 'Ativar verificação em duas etapas'), undefined);
  findButton(unavailable, 'Consultar novamente').props.onClick();
  await settle();
  assert.match(textOf(render()), /MFA ativo/);
  assert.equal(reads, 2);
});

function tablesFixture(t) {
  const hooks = hookHarness();
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', (resolve, ms) => {
    assert.equal(ms, 3000);
    timers.push(resolve);
    return timers.length;
  });
  const requests = [];
  const queriedTargets = [];
  const { FleetPfTablesPanel } = sourceLoader({ ...uiMocks, react: hooks.react,
    '@/components/nodes/node-command-progress': { commandStatusLabel: (s) => s },
    '@/lib/operational-actions-actions': { requestTableSearchAction: async (_, target) => {
      queriedTargets.push(target);
      return { ok: true, command_id: 'synthetic', status: 'pending' };
    } },
    '@/lib/node-commands-actions': { fetchNodeCommandDetail: () => { const job = deferred(); requests.push(job); return job.promise; } },
  })('components/nodes/fleet-pf-tables-panel.tsx');
  const child = FleetPfTablesPanel({ selectedNodes: [{ id: 'synthetic', hostname: 'Synthetic', agent_version: '0.5.25' }] });
  let tree;
  const render = () => tree = hooks.render(child.type, child.props);
  render();
  const ip = (value) => { elements(tree).find((e) => e.type === 'input' && e.props.placeholder).props.onChange({ target: { value } }); render(); };
  return { hooks, requests, queriedTargets, render, ip, tick: () => timers.shift()?.(), get tree() { return tree; } };
}

test('consulta lenta só agenda o próximo polling depois de concluir a leitura anterior', async (t) => {
  const pf = tablesFixture(t);
  pf.ip('203.0.113.2');
  findButton(pf.tree, 'Consultar').props.onClick();
  await settle();
  pf.render();
  pf.tick();
  pf.tick();
  assert.equal(pf.requests.length, 1);
  pf.requests[0].resolve({ command: { status: 'running', result_json: {} } });
  await settle();
  assert.match(textOf(pf.render()), /running/);
  pf.tick();
  await settle();
  pf.tick();
  assert.equal(pf.requests.length, 2);
  pf.requests[1].resolve({ command: { status: 'succeeded', result_json: { ok: true, tables: ['sshguard'] } } });
  await settle();
  assert.match(textOf(pf.render()), /sshguard/i);
  assert.equal(elements(pf.tree).filter((e) => e.props?.type === 'checkbox').length, 1);
  pf.hooks.unmount();
});

test('uma consulta em andamento bloqueia edição e a próxima consulta usa somente o novo alvo', async (t) => {
  const pf = tablesFixture(t);
  pf.ip('203.0.113.2');
  findButton(pf.tree, 'Consultar').props.onClick();
  await settle();
  pf.render();
  assert.ok(elements(pf.tree).find((item) => item.props.placeholder).props.disabled);
  pf.ip('203.0.113.3');
  findButton(pf.tree, 'Consultar').props.onClick();
  await settle();
  assert.deepEqual(pf.queriedTargets, ['203.0.113.2']);
  assert.equal(pf.requests.length, 1);
  pf.requests[0].resolve({ command: { status: 'succeeded', result_json: { ok: true, tables: ['sshguard'] } } });
  await settle();
  assert.match(textOf(pf.render()), /sshguard/i);
  assert.equal(elements(pf.tree).filter((item) => item.props?.type === 'checkbox').length, 1);
  pf.ip('203.0.113.3');
  assert.equal(elements(pf.tree).filter((item) => item.props?.type === 'checkbox').length, 0);
  findButton(pf.tree, 'Consultar').props.onClick();
  await settle();
  assert.equal(pf.requests.length, 2);
  assert.deepEqual(pf.queriedTargets, ['203.0.113.2', '203.0.113.3']);
  pf.requests[1].resolve({ command: { status: 'succeeded', result_json: { ok: true, tables: ['snort2c'] } } });
  await settle();
  assert.match(textOf(pf.render()), /snort2c/i);
  pf.hooks.unmount();
});

test('admin técnicos passa o limite da API ao seletor e não entrega inventário como lote automático', async () => {
  const nodes = Array.from({ length: 101 }, (_, i) => ({ id: `node-${i}`, hostname: `Synthetic ${i}`, client: { name: 'Lab' } }));
  const page = sourceLoader({ ...uiMocks,
    '@/components/admin-technician-targets': { AdminTechnicianTargets: 'targets' },
    '@/components/ui/action-tabs': { ActionTabs: 'tech-tabs' },
    '@/lib/api': { getSession: async () => ({ permissions: ['technicians.view', 'technicians.manage', 'firewalls.view'], has_global_client_scope: true }), getTechnicians: async () => ({ items: [], batch_max_size: 100 }), getNodesList: async () => ({ items: nodes }) },
  })('app/admin/tecnicos/page.tsx').default;
  const tabs = elements(await page()).find((e) => e.type === 'tech-tabs').props.tabs;
  const selector = elements(tabs.find((tab) => tab.id === 'manage').content).find((e) => e.type === 'targets');
  assert.equal(selector.props.batchMaxSize, 100);
  assert.equal(selector.props.nodes.length, 101);
  assert.equal(selector.props.nodeIds, undefined);
});

test('seletor parte vazio, limita seleção explicitamente e mantém o alvo 101 acessível', () => {
  for (const cap of [100, 7]) {
    const hooks = hookHarness();
    const { AdminTechnicianTargets } = sourceLoader({ ...uiMocks, react: hooks.react,
      '@/lib/use-paged-nodes': { usePagedNodes: () => ({ loading: false, result: { items: Array.from({ length: 101 }, (_, i) => ({ id: `node-${i + 1}`, hostname: `Synthetic ${i + 1}`, client: { name: 'Lab' } })) } }) },
      '@/components/node-browser-controls': { NodeBrowserControls: 'node-browser' },
      '@/components/nodes/fleet-technician-management-panel': { FleetTechnicianManagementPanel: 'panel' },
    })('components/admin-technician-targets.tsx');
    const props = { nodes: Array.from({ length: 101 }, (_, i) => ({ id: `node-${i + 1}`, hostname: `Synthetic ${i + 1}`, client: { name: 'Lab' } })), batchMaxSize: cap, canManageTechnicians: true, canManageRegistry: true, canResetTechnicianPassword: true };
    let tree = hooks.render(AdminTechnicianTargets, props);
    const panel = () => elements(tree).find((e) => e.type === 'panel');
    assert.deepEqual(panel().props.nodeIds, []);
    assert.equal(panel().props.allowFleetRevoke, false);
    findButton(tree, 'Selecionar primeiros').props.onClick();
    tree = hooks.render(AdminTechnicianTargets, props);
    assert.equal(panel().props.nodeIds.length, cap);
    const checks = elements(tree).filter((e) => e.props?.type === 'checkbox');
    assert.equal(checks.at(-1).props.disabled, true);
    checks.at(-1).props.onChange(); // Mesmo uma invocação direta não ultrapassa o cap.
    tree = hooks.render(AdminTechnicianTargets, props);
    assert.equal(panel().props.nodeIds.length, cap);
    findButton(tree, 'Limpar seleção').props.onClick();
    tree = hooks.render(AdminTechnicianTargets, props);
    elements(tree).filter((e) => e.props?.type === 'checkbox').at(-1).props.onChange();
    tree = hooks.render(AdminTechnicianTargets, props);
    assert.deepEqual(panel().props.nodeIds, ['node-101']);
  }
});

function techniciansFixture({ cap = 100, size = 101, result } = {}) {
  const hooks = hookHarness();
  const calls = [];
  const respond = async (action, input) => {
    calls.push({ action, input });
    return { ok: true, data: result ?? { batch: null, technician: { id: 'tech', full_name: 'Synthetic' }, results: [], summary: { total: input.node_ids.length, enqueued: 0, failed: 0, skipped: input.node_ids.length } } };
  };
  const { FleetTechnicianManagementPanel } = sourceLoader({ ...uiMocks, react: hooks.react,
    '@/lib/technicians': {
      listTechniciansAction: async () => ({ batch_max_size: cap, items: [{ id: 'tech', full_name: 'Synthetic', login_username: 'synthetic', node_account_count: 1 }] }),
      createTechnicianBatchProvisionAction: (input) => respond('provision', input),
      createTechnicianBatchPasswordResetAction: (input) => respond('reset', input),
      createTechnicianBatchRevokeAction: (input) => respond('revoke', input),
      createTechnicianFleetRevokeAction: () => assert.fail('Nenhuma ação em toda a frota no seletor'),
    },
  })('components/nodes/fleet-technician-management-panel.tsx');
  let props = { nodeIds: Array.from({ length: size }, (_, i) => `node-${i}`), mode: 'selection', allowFleetRevoke: false, canManageTechnicians: true, canManageRegistry: false, canResetTechnicianPassword: true };
  let tree;
  const render = () => tree = hooks.render(FleetTechnicianManagementPanel, props);
  const confirm = () => {
    elements(tree).find((e) => e.type === 'input' && e.props.placeholder === 'CONFIRMAR').props.onChange({ target: { value: 'CONFIRMAR' } });
    render();
  };
  return { hooks, calls, render, confirm, get tree() { return tree; }, setNodes: (nodeIds) => { props = { ...props, nodeIds }; render(); render(); } };
}

test('cap efetivo bloqueia lote 101/100 em provision/reset/revoke sem comandos ou chunks', async () => {
  const panel = techniciansFixture();
  panel.render();
  await settle();
  panel.render();
  assert.match(textOf(panel.tree), /entre 1 e 100/);
  const provision = findButton(panel.tree, 'Provisionar em');
  assert.equal(provision.props.disabled, true);
  provision.props.onClick();
  panel.render();
  panel.confirm();
  findButton(panel.tree, 'Confirmar provisionar').props.onClick();
  await settle();
  panel.render();
  findButton(panel.tree, 'Cancelar').props.onClick();
  panel.render();
  findButton(panel.tree, 'Alterar senha').props.onClick();
  panel.render();
  assert.equal(findButton(panel.tree, 'Alterar senha em').props.disabled, true);
  findButton(panel.tree, 'Remover dos firewalls').props.onClick();
  panel.render();
  assert.equal(findButton(panel.tree, 'Remover em').props.disabled, true);
  findButton(panel.tree, 'Remover em').props.onClick();
  panel.render();
  assert.ok(!elements(panel.tree).some((e) => e.props?.placeholder === 'CONFIRMAR'));
  assert.deepEqual(panel.calls, []);
});

test('limite ausente não presume 100; lote permitido exige confirmação e preserva resultados ao trocar alvos', async () => {
  const { technicianBatchLimit } = sourceLoader()('lib/technician-batch-limit.ts');
  assert.equal(technicianBatchLimit(undefined), null);
  const invalid = techniciansFixture({ cap: null, size: 1 });
  invalid.render();
  await settle();
  invalid.render();
  assert.match(textOf(invalid.tree), /Limite do lote indisponível/);
  assert.equal(findButton(invalid.tree, 'Provisionar em').props.disabled, true);
  assert.deepEqual(invalid.calls, []);
  const panel = techniciansFixture({ cap: 2, size: 2 });
  panel.render();
  await settle();
  panel.render();
  assert.equal(findButton(panel.tree, 'Provisionar em').props.disabled, false);
  assert.deepEqual(panel.calls, []);
  findButton(panel.tree, 'Provisionar em').props.onClick();
  panel.render();
  assert.equal(findButton(panel.tree, 'Confirmar provisionar').props.disabled, true);
  panel.confirm();
  panel.setNodes(['other-0', 'other-1']);
  assert.ok(!elements(panel.tree).some((e) => e.props?.placeholder === 'CONFIRMAR'), 'troca de alvos exige nova confirmação');
  findButton(panel.tree, 'Provisionar em').props.onClick();
  panel.render();
  panel.confirm();
  findButton(panel.tree, 'Confirmar provisionar').props.onClick();
  await Promise.all(panel.hooks.transitions);
  assert.equal(panel.calls.length, 1);
  assert.deepEqual(panel.calls[0].input.node_ids, ['other-0', 'other-1']);
  assert.equal(panel.calls[0].input.confirm, 'CONFIRMAR');
  assert.match(textOf(panel.render()), /Lote de/);
  panel.setNodes(['next-target']);
  assert.match(textOf(panel.tree), /Lote de/);
  assert.equal(panel.calls.length, 1, 'troca de seleção não dispara novo lote');
});

test('usuarios/page nega não-superadmin antes de qualquer leitura administrativa', async () => {
  for (const role of ['admin', 'operator', 'readonly', 'superadmin']) {
    let reads = 0;
    const read = async (value) => { reads++; return value; };
    const page = sourceLoader({ ...uiMocks,
      '@/components/admin-usuarios-tabs': { AdminUsuariosTabs: 'users-tabs' },
      '@/lib/api': {
        ApiError: class extends Error {},
        getSession: async () => ({ user: { role, id: 'synthetic' }, permissions: ['users.view'] }),
        getUsersList: () => read({ items: [] }), getActiveAdminClientOptions: () => read([]), getRolesList: () => read({ items: [] }),
      },
      'next/navigation': { redirect: (url) => { const error = new Error('Synthetic redirect'); error.url = url; throw error; } },
    })('app/admin/usuarios/page.tsx').default;
    if (role === 'superadmin') {
      assert.ok(await page({}));
      assert.equal(reads, 3);
    } else {
      await assert.rejects(() => page({}), (error) => error.url === '/conta?access=denied');
      assert.equal(reads, 0);
    }
  }
});

test('SSE primeiro open atualiza snapshot mesmo sem novo evento; connected não duplica', (t) => {
  const hooks = hookHarness();
  let source;
  class Source {
    static CLOSED = 2;
    handlers = new Map();
    constructor() { source = this; }
    addEventListener(name, fn) { this.handlers.set(name, fn); }
    removeEventListener(name) { this.handlers.delete(name); }
    close() {}
    emit(name) { this.handlers.get(name)?.(); }
  }
  const oldWindow = globalThis.window;
  const oldSource = globalThis.EventSource;
  const timers = new Map();
  let timerId = 0;
  globalThis.EventSource = Source;
  globalThis.window = { setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id) };
  t.after(() => { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; if (oldSource === undefined) delete globalThis.EventSource; else globalThis.EventSource = oldSource; });
  let refreshed = 0;
  const router = { refresh: () => refreshed++ };
  const { RealtimeRefresh } = sourceLoader({ react: hooks.react, 'next/navigation': { useRouter: () => router } })('components/realtime-refresh.tsx');
  hooks.render(RealtimeRefresh, { scope: 'node', nodeId: 'synthetic' });
  assert.equal(timers.size, 0);
  source.emit('open');
  source.emit('connected');
  assert.equal(timers.size, 1);
  const [id, fire] = [...timers.entries()][0]; timers.delete(id); fire();
  assert.equal(refreshed, 1);
  source.emit('open');
  assert.equal(timers.size, 1);
  hooks.unmount();
  assert.equal(timers.size, 0);
});
