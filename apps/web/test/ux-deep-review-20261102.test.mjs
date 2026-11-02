import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, hookHarness, elements, textOf, settle } from './source-harness.mjs';

const findButton = (tree, label) => elements(tree).find((element) =>
  element.type === 'button' && textOf(element).includes(label));

test('backups incluem páginas além de 1000, sem duplicar IDs durante alterações concorrentes', async () => {
  const { collectBackupFleetPages } = sourceLoader()('lib/backup-fleet-helpers.ts');
  const requests = [];
  const first = Array.from({ length: 1000 }, (_, i) => ({ id: `fw-${i}` }));
  const second = [{ id: 'fw-999' }, ...Array.from({ length: 1000 }, (_, i) => ({ id: `fw-${1000 + i}` }))];
  const third = Array.from({ length: 501 }, (_, i) => ({ id: `fw-${2000 + i}` }));
  const pages = new Map([
    [undefined, { items: first, total: 2501, generated_at: 'T1', next_cursor: 'C1' }],
    ['C1', { items: second, total: 2501, generated_at: 'T2', next_cursor: 'C2' }],
    ['C2', { items: third, total: 2501, generated_at: 'T3', next_cursor: null }],
  ]);
  const result = await collectBackupFleetPages(async (cursor) => {
    requests.push(cursor);
    return pages.get(cursor);
  });
  assert.deepEqual(requests, [undefined, 'C1', 'C2']);
  assert.equal(result.items.length, 2501);
  assert.equal(result.generated_at, 'T3');
  assert.equal(new Set(result.items.map((item) => item.id)).size, 2501);
});

test('backups falham visivelmente quando o cursor entra em ciclo', async () => {
  const { collectBackupFleetPages } = sourceLoader()('lib/backup-fleet-helpers.ts');
  await assert.rejects(
    collectBackupFleetPages(async () => ({ items: [{ id: 'fw' }], total: 3, generated_at: 'T', next_cursor: 'same' })),
    /paginação do inventário não avançou/,
  );
});

test('selecionar todos preserva vínculo indisponível até remoção explícita e informa alterações', () => {
  const hooks = hookHarness();
  let changed = 0;
  const { ClientScopePicker } = sourceLoader({ react: hooks.react })('components/client-scope-picker.tsx');
  const props = {
    clients: [{ id: 'a', name: 'Ativa A', code: 'A' }, { id: 'b', name: 'Ativa B', code: 'B' }],
    selectedIds: ['a', 'old'],
    onSelectionChange: () => changed++,
  };
  let tree = hooks.render(ClientScopePicker, props);
  findButton(tree, 'Selecionar todos').props.onClick();
  tree = hooks.render(ClientScopePicker, props);
  const selected = () => elements(tree).filter((element) => element.type === 'input' && element.props.name === 'client_ids').map((element) => element.props.value).sort();
  assert.deepEqual(selected(), ['a', 'b', 'old']);
  assert.equal(changed, 1);
  const old = elements(tree).find((element) => element.type === 'input' && element.props.checked && !element.props.name);
  assert.ok(old);
  old.props.onChange();
  tree = hooks.render(ClientScopePicker, props);
  assert.deepEqual(selected(), ['a', 'b']);
  assert.equal(changed, 2);
});

test('cliente com permissão de excluir e sem permissão de editar mantém exclusão disponível', () => {
  const hooks = hookHarness();
  const { AdminClientsList } = sourceLoader({ ...uiMocks, react: hooks.react,
    '@/components/client-delete-button': { ClientDeleteButton: 'delete-client' },
    '@/lib/admin': { updateClientAction: async () => {} },
  })('components/admin-clients-list.tsx');
  const client = { id: 'c1', code: 'C1', name: 'Cliente A', status: 'active', node_count: 0 };
  const props = { clients: [client], returnTo: '/admin/clientes', canUpdate: false, canDelete: true };
  let tree = hooks.render(AdminClientsList, props);
  assert.equal(elements(tree).filter((element) => element.type === 'delete-client').length, 1);
  assert.equal(elements(tree).filter((element) => element.type === 'form').length, 0);
  tree = hooks.render(AdminClientsList, { ...props, canDelete: false });
  assert.equal(elements(tree).filter((element) => element.type === 'delete-client').length, 0);
});

function userFixture({ activeSection, sessionRevision } = {}) {
  const hooks = hookHarness();
  const fetched = [];
  const { AdminUsuariosTabs } = sourceLoader({ ...uiMocks, react: hooks.react,
    '@/components/confirm-dialog': { ConfirmDialog: 'confirm-dialog' },
    '@/components/role-scope-fields': { RoleScopeFields: 'scope-fields' },
    '@/lib/admin-user-sessions-actions': { getAdminUserSessionsAction: async (id) => { fetched.push(id); return { ok: true, items: [] }; } },
    '@/lib/admin': { deleteUserAction: async () => {}, updateUserAction: async () => {}, revokeUserSessionAdminAction: async () => {} },
  })('components/admin-usuarios-tabs.tsx');
  const users = ['u1', 'u2'].map((id) => ({ id, email: `${id}@example.test`, display_name: id, role: 'admin', status: 'active', client_ids: ['old'], client_id: null }));
  const props = {
    users, clients: [{ id: 'active', name: 'Ativa', code: 'AT' }],
    roles: [{ code: 'admin', label: 'Administrador' }], currentUserId: 'super', canManageUsers: true,
    initialUserId: 'u1', activeSection, sessionRevision,
    SectionMessage: 'section-message',
  };
  const render = (override = {}) => hooks.render(AdminUsuariosTabs, { ...props, ...override });
  return { hooks, fetched, render };
}

test('escopo alterado bloqueia troca de usuário e vínculo inválido bloqueia submissão', (t) => {
  const fixture = userFixture();
  const previousWindow = globalThis.window;
  globalThis.window = { confirm: () => false };
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(form) { this.values = form.values; }
    get(key) { return this.values[key] ?? null; }
    getAll(key) { return this.values[key] instanceof Array ? this.values[key] : []; }
  };
  t.after(() => { globalThis.window = previousWindow; globalThis.FormData = NativeFormData; });
  let tree = fixture.render();
  const scope = elements(tree).find((element) => element.type === 'scope-fields');
  scope.props.onScopeChange();
  tree = fixture.render();
  findButton(tree, 'u2@example.test').props.onClick();
  tree = fixture.render();
  assert.match(textOf(tree), /Perfil:\s+Administrador/);
  assert.ok(elements(tree).find((element) => element.type === 'input' && element.props.name === 'user_id' && element.props.value === 'u1'));
  let prevented = false;
  const form = elements(tree).find((element) => element.type === 'form' && element.props.action);
  form.props.onSubmit({ currentTarget: { values: { role: 'admin', client_ids: ['old'] } }, preventDefault: () => prevented = true });
  tree = fixture.render();
  assert.equal(prevented, true);
  assert.match(textOf(tree), /Remova-os explicitamente/);
});

test('revogação de sessão dispara nova busca ao mudar o identificador da ação', async () => {
  const fixture = userFixture({ activeSection: 'user-sessions', sessionRevision: 'A' });
  fixture.render();
  await settle();
  assert.deepEqual(fixture.fetched, ['u1']);
  fixture.render({ sessionRevision: 'B' });
  await settle();
  assert.deepEqual(fixture.fetched, ['u1', 'u1']);
});

test('permissão de excluir usuário não depende da permissão de editar', () => {
  const fixture = userFixture();
  let tree = fixture.render({ canManageUsers: false, canDeleteUsers: true });
  assert.equal(elements(tree).filter((el) => el.type === 'form').length, 0);
  assert.ok(findButton(tree, 'Excluir usuário'));
  tree = fixture.render({ canManageUsers: true, canDeleteUsers: false });
  assert.equal(findButton(tree, 'Excluir usuário'), undefined);
  assert.ok(elements(tree).some((el) => el.type === 'form' && el.props.action));
});

test('navegação entre ativos e inativos protege edição; URL de seleção sincroniza ficha', (t) => {
  const fixture = userFixture();
  const previousWindow = globalThis.window;
  globalThis.window = { confirm: () => false };
  t.after(() => { globalThis.window = previousWindow; });
  let tree = fixture.render();
  elements(tree).find((element) => element.type === 'scope-fields').props.onScopeChange();
  tree = fixture.render();
  let prevented = false;
  const inactiveLink = elements(tree).find((element) => element.type === 'a' && element.props.href?.includes('showInactive'));
  assert.ok(inactiveLink);
  inactiveLink.props.onClick({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  // A seleção externa também exige descartar alterações pendentes.
  fixture.render({ initialUserId: 'u2' });
  tree = fixture.render({ initialUserId: 'u2' });
  assert.ok(elements(tree).some((element) => element.type === 'input' && element.props.name === 'user_id' && element.props.value === 'u1'));
  globalThis.window.confirm = () => true;
  fixture.render({ initialUserId: 'u1' });
  fixture.render({ initialUserId: 'u2' });
  tree = fixture.render({ initialUserId: 'u2' });
  assert.ok(elements(tree).some((element) => element.type === 'input' && element.props.name === 'user_id' && element.props.value === 'u2'));
});

test('diagnóstico de bootstrap protege URLs com aspas e preserva cursor ao trocar modo', () => {
  const { shellQuote, buildPfSensePrecheckBlock, buildBootstrapHref } = sourceLoader()('lib/bootstrap-command-helpers.ts');
  assert.equal(shellQuote("abc'def"), "'abc'\\''def'");
  const malicious = "https://example.test/' ; printf RISK ; '";
  const precheck = buildPfSensePrecheckBlock({
    controllerUrl: malicious,
    installerUrl: malicious,
    artifactUrl: malicious,
    checksumUrl: malicious,
  });
  assert.ok(precheck.includes(`fetch -qo /tmp/monitor-controller-check.out ${shellQuote(`${malicious}/healthz`)} || true`));
  assert.ok(precheck.includes(`fetch -qo /tmp/monitor-installer-check.out ${shellQuote(malicious)} || true`));
  assert.ok(precheck.includes(`fetch -qo /tmp/monitor-artifact-check.out ${shellQuote(malicious)} || true`));
  assert.ok(precheck.includes(`fetch -qo /tmp/monitor-checksum-check.out ${shellQuote(malicious)} || true`));
  const href = buildBootstrapHref({ cursor: 'page-two', nodeId: 'fw-two', controllerUrl: 'https://ctrl.example', heartbeatMode: 'light' });
  assert.equal(new URL(href, 'https://test.invalid').searchParams.get('cursor'), 'page-two');
  assert.equal(new URL(href, 'https://test.invalid').searchParams.get('node_id'), 'fw-two');
  assert.equal(new URL(href, 'https://test.invalid').searchParams.get('heartbeat_mode'), 'light');
});

test('sessões expiradas não contam como ativas e não oferecem revogação', async () => {
  const { default: SessionsPage } = sourceLoader({
    ...uiMocks,
    'next/navigation': { redirect: () => { throw new Error('unexpected redirect'); } },
    '@/lib/api': {
      getSession: async () => ({ user: { email: 'tester@example.test' } }),
      getAuthSessions: async (query) => { assert.deepEqual(query, { view: 'all', q: '', page: 1, per_page: 25 }); return { total: 2, active_count: 1, page: 1, per_page: 25, total_pages: 1, items: [
        { id: 'current', current: true, revoked_at: null, expires_at: '2100-01-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z', ip_address: '10.0.0.1', user_agent: 'current' },
        { id: 'expired', current: false, revoked_at: null, expires_at: '2000-01-01T00:00:00Z', created_at: '1999-01-01T00:00:00Z', ip_address: '10.0.0.2', user_agent: 'expired' },
      ] }; },
    },
    '@/lib/auth': { revokeSessionAction: async () => {} },
  })('app/sessions/page.tsx');
  const tree = await SessionsPage({ searchParams: Promise.resolve({ view: 'all' }) });
  const hero = elements(tree).find((el) => el.type === 'hero');
  assert.equal(hero.props.stats.find((stat) => stat.label === 'Ativas').value, '1');
  const expiredRow = elements(tree).find((el) => el.type === 'tr' && textOf(el).includes('10.0.0.2'));
  assert.ok(expiredRow);
  assert.equal(elements(expiredRow).filter((el) => el.type === 'form').length, 0);
});

test('detalhe do firewall compartilha precheck seguro com a tela bootstrap', () => {
  const load = sourceLoader();
  const nodeDetail = load('lib/node-detail-helpers.ts');
  const bootstrap = load('lib/bootstrap-command-helpers.ts');
  assert.equal(nodeDetail.buildPfSensePrecheckBlock, bootstrap.buildPfSensePrecheckBlock);
  assert.equal(nodeDetail.extractHostname, bootstrap.extractHostname);
});

test('abas do detalhe mantêm todos os painéis ARIA e montam conteúdo apenas da aba ativa', () => {
  const hooks = hookHarness();
  const { NodeDetailTabs } = sourceLoader({
    ...uiMocks, react: hooks.react,
    'next/navigation': {
      useRouter: () => ({ replace: () => {} }),
      usePathname: () => '/nodes/firewall',
      useSearchParams: () => ({ get: () => 'backup', toString: () => 'tab=backup' }),
    },
  })('components/nodes/node-detail-tabs.tsx');
  const tabs = ['overview', 'metrics', 'backup'].map((id) => ({ id, label: id }));
  const tree = hooks.render(NodeDetailTabs, { tabs, overview: 'overview-content', metrics: 'metrics-content', backup: 'backup-content' });
  const panels = elements(tree).filter((el) => el.props?.role === 'tabpanel');
  const tabElements = elements(tree).filter((el) => el.props?.role === 'tab');
  assert.equal(panels.length, 3);
  assert.equal(panels.filter((el) => !el.props.hidden).length, 1);
  assert.equal(textOf(panels.find((el) => !el.props.hidden)), 'backup-content');
  for (const tab of tabElements) assert.ok(panels.some((panel) => panel.props.id === tab.props['aria-controls']));
});
