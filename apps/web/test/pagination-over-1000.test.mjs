import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { apiSourceLoader, syntheticDb, scopedPolicy, matches } from './pagination-api-harness.mjs';
import { sourceLoader, uiMocks, elements, textOf, hookHarness, deferred, settle } from './source-harness.mjs';

const actor = { userId: 'synthetic-user', role: 'readonly' };
const config = { packageRelease: { version: '0.5.25' }, nodeStatus: { offlineAfterSeconds: 300, degradedAfterSeconds: 90 } };
const loadApi = apiSourceLoader({ '../config/app-config': { appConfig: config } });
const { NodesService } = loadApi('nodes/nodes.service');
const { AlertsService } = loadApi('alerts/alerts.service');
const { compareListNodes, NodePageCollector, encodeNodeCursor, decodeNodeCursor } = loadApi('nodes/list-nodes-sort.util');
const time = new Date();
const nodes = Array.from({ length: 1540 }, (_, i) => {
  const clientId = i < 1327 ? 'client-a' : 'client-b';
  return { id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, nodeUid: `fw-${i}`, hostname: `fw-${i % 47}`,
    displayName: i % 3 ? `Firewall ${i % 19}` : null, status: i % 5 === 0 ? 'degraded' : 'online', maintenanceMode: false,
    lastSeenAt: time, pfsenseVersion: i % 2 ? '2.9.0' : '2.8.1', agentVersion: i % 2 ? '0.5.25' : '0.5.24',
    managementIp: null, wanIp: null, remoteAccessUrl: null, nodeUidStatus: 'active', criticality: i % 2 ? 'critical' : 'standard',
    siteId: i % 2 ? 'site-1' : 'site-2', site: { id: i % 2 ? 'site-1' : 'site-2', name: 'Lab', code: 'LAB', clientId,
      timezone: 'UTC', client: { id: clientId, name: 'Synthetic', code: 'SYN' } },
    nodeTags: i % 2 ? [{ tagId: 'tag-a', tag: { id: 'tag-a', name: 'Tag' } }] : [],
    groupMembers: i % 3 ? [{ groupId: 'group-a' }] : [],
    _count: { alerts: i % 4 }, configBackupPolicyJson: null,
    configBackups: i % 4 ? [{ status: 'stored', receivedAt: new Date(time - (i % 4 === 1 ? 72 : 1) * 3600000), configSha256: 'synthetic' }] : [],
    nodeCommands: i % 11 === 0 ? [{ requestedAt: time, completedAt: time }] : [],
  };
});
function nodeService() { const fixture = syntheticDb(nodes); return { ...fixture, service: new NodesService(fixture.db, scopedPolicy()) }; }
async function allPages(service, query, access = actor) {
  const pages = []; let cursor;
  do {
    const page = await service.listNodes(access, { ...query, cursor });
    pages.push(page); cursor = page.next_cursor;
    assert.ok(pages.length < 100, 'cursor must terminate');
  } while (cursor);
  return pages;
}

// Entire new group runs once after the implementation block; no old suite imports.
test('1327 scoped nodes: every page beyond 1000, unique ties and reverse navigation for all sort fields', async () => {
  for (const sort_by of ['name', 'status', 'version', 'agent_version', 'backup', 'alerts', 'last_seen']) {
    for (const sort_order of ['asc', 'desc']) {
      const { service, calls } = nodeService();
      const pages = await allPages(service, { limit: 127, sort_by, sort_order });
      const result = pages.flatMap((p) => p.items);
      assert.equal(result.length, 1327);
      assert.equal(new Set(result.map((n) => n.id)).size, 1327);
      assert.ok(result.some((n) => n.node_uid === 'fw-1326'));
      for (const page of pages) { assert.equal(page.total, 1327); assert.equal(page.limit, 127); assert.ok(page.items.length <= 127); }
      for (let i = 1; i < result.length; i++) assert.ok(compareListNodes(result[i - 1], result[i], sort_by, sort_order) < 0);
      const last = pages.at(-1);
      assert.equal(last.next_cursor, null);
      const previous = await service.listNodes(actor, { limit: 127, sort_by, sort_order, cursor: last.previous_cursor });
      assert.deepEqual(previous.items.map((n) => n.id), pages.at(-2).items.map((n) => n.id));
      const nextAgain = await service.listNodes(actor, { limit: 127, sort_by, sort_order, cursor: previous.next_cursor });
      assert.deepEqual(nextAgain.items.map((n) => n.id), last.items.map((n) => n.id));
      assert.ok(calls.filter((c) => c.kind === 'node').every((c) => c.query.take === 250 && c.query.include._count.select.alerts.where.status === 'open'));
      assert.ok(calls.filter((c) => c.kind === 'transaction').every((c) => c.options.isolationLevel === 'RepeatableRead'));
    }
  }
});

test('search finds node 1326; client/site/tag/group/criticality and derived presets apply before paging/count', async () => {
  const { service } = nodeService();
  const found = await service.listNodes(actor, { search: 'fw-1326', limit: 10 });
  assert.equal(found.total, 1); assert.equal(found.items[0].node_uid, 'fw-1326');
  const global = await allPages(service, { limit: 1000 });
  const all = global.flatMap((p) => p.items);
  for (const preset of ['problem', 'offline', 'degraded', 'backup-late', 'no-backup', 'package-outdated']) {
    const predicate = (n) => preset === 'offline' ? n.effective_status === 'offline'
      : preset === 'degraded' ? n.effective_status === 'degraded'
      : preset === 'backup-late' ? ['late', 'failed'].includes(n.backup_status)
      : preset === 'no-backup' ? n.backup_status === 'never'
      : preset === 'package-outdated' ? n.agent_version !== config.packageRelease.version
      : ['offline', 'degraded'].includes(n.effective_status) || n.open_alerts > 0 || n.backup_status !== 'ok' || n.agent_version !== config.packageRelease.version;
    const expected = all.filter(predicate).map((n) => n.id);
    const pages = await allPages(service, { preset, limit: 89 });
    assert.equal(pages[0].total, expected.length);
    assert.deepEqual(pages.flatMap((p) => p.items.map((n) => n.id)), expected);
  }
  const query = { client_id: 'client-a', site_id: 'site-1', tag_id: 'tag-a', group_id: 'group-a', criticality: 'critical', status: 'degraded', limit: 13 };
  const filtered = await allPages(service, query);
  const expected = nodes.filter((n) => matches(n, { site: { clientId: 'client-a' }, siteId: 'site-1', nodeTags: { some: { tagId: 'tag-a' } }, groupMembers: { some: { groupId: 'group-a' } }, criticality: 'critical', status: 'degraded' }));
  assert.equal(filtered[0].total, expected.length);
  assert.deepEqual(new Set(filtered.flatMap((p) => p.items.map((n) => n.id))), new Set(expected.map((n) => n.id)));
  for (const query of [{ client_id: 'client-b' }, { tag_id: 'tag-b' }, { group_id: 'group-b' }]) await assert.rejects(service.listNodes(actor, query), /forbidden/);
});

test('limits, legacy shape, empty result and cursors bound to actor/filter/order', async () => {
  const { service } = nodeService();
  const first = await service.listNodes(actor, {});
  assert.equal(first.items.length, 500); assert.equal(first.total, 1327); assert.equal(typeof first.generated_at, 'string');
  assert.equal(first.previous_cursor, null);
  for (const limit of [0, -1, 1.2, 1001, Infinity, NaN]) await assert.rejects(service.listNodes(actor, { limit }), /limit/);
  for (const changed of [{ search: 'else' }, { sort_by: 'status' }, { sort_order: 'desc' }]) await assert.rejects(service.listNodes(actor, { ...changed, cursor: first.next_cursor }), /Cursor/);
  await assert.rejects(service.listNodes({ ...actor, userId: 'different' }, { cursor: first.next_cursor }), /Cursor/);
  for (const cursor of ['!', 'a'.repeat(8193), Buffer.from('{}').toString('base64url')]) await assert.rejects(service.listNodes(actor, { cursor }), /Cursor/);
  const none = await service.listNodes(actor, { search: 'absent-synthetic-node' });
  assert.equal(none.total, 0); assert.equal(none.next_cursor, null); assert.equal(none.previous_cursor, null);
  const global = await service.listNodes({ ...actor, role: 'superadmin' }, { limit: 1 }); assert.equal(global.total, 1540);
});

test('stream collector remains bounded at 37 rows over 100001 entries, including reverse cursor', () => {
  const sample = { id: '', hostname: 'same', display_name: null, effective_status: 'online', pfsense_version: null,
    agent_version: null, open_alerts: 0, backup_status: 'ok', last_seen_at: null, client: { name: 'same' } };
  const compare = (a, b) => compareListNodes(a, b, 'name', 'asc');
  const anchor = { ...sample, id: '00050000' };
  for (const direction of ['after', 'before']) {
    const cursor = decodeNodeCursor(encodeNodeCursor(anchor, direction, 'synthetic-filter', time.toISOString()), 'synthetic-filter');
    const collector = new NodePageCollector(37, compare, cursor);
    for (let i = 100000; i >= 0; i--) { collector.add({ ...sample, id: String(i).padStart(8, '0') }); assert.ok(collector.items.length <= 37); }
    assert.equal(collector.total, 100001); assert.equal(collector.items.length, 37);
    assert.equal(collector.items[0].id, direction === 'after' ? '00050001' : '00049963');
  }
});

const alerts = Array.from({ length: 1540 }, (_, i) => ({ id: `alert-${String(i).padStart(5, '0')}`, node: nodes[i], nodeId: nodes[i].id,
  status: ['open', 'acknowledged', 'resolved'][i % 3], severity: ['critical', 'warning', 'info'][Math.floor(i / 3) % 3],
  type: 'service_down', title: `Synthetic ${i}`, description: 'Lab', openedAt: new Date(time - (i % 13) * 1000), acknowledgedAt: null,
  acknowledgedBy: null, resolvedAt: null, resolutionNote: null, metadataJson: null }));

test('alerts: DB pages beyond 1000, filtered totals, deterministic ties and legacy complete contract', async () => {
  const { db, calls } = syntheticDb(nodes, alerts);
  const service = new AlertsService(db, scopedPolicy());
  for (const sort_by of ['legacy', 'attention']) {
    const seen = [];
    for (let page = 1; page <= 11; page++) {
      const result = await service.listAlerts(actor, { page, limit: 127, sort_by });
      assert.equal(result.page, page); assert.equal(result.total, 1327); assert.equal(result.total_pages, 11);
      assert.equal(result.totals.open + result.totals.acknowledged + result.totals.resolved, 1327);
      assert.ok(result.items.every((a) => a.client.id === 'client-a'));
      seen.push(...result.items.map((a) => a.id));
    }
    assert.equal(seen.length, 1327); assert.equal(new Set(seen).size, 1327);
  }
  for (const query of [{ status: 'open', severity: 'critical' }, { node_id: nodes[1326].id }, { search: 'Synthetic 1326' }, { site_id: 'site-1', type: 'service_down' }]) {
    const result = await service.listAlerts(actor, { ...query, page: 1, limit: 17 });
    const countCall = calls.filter((c) => c.kind === 'counts').at(-1);
    assert.equal(result.total, alerts.filter((a) => matches(a, countCall.query.where)).length);
    const listCall = calls.filter((c) => c.kind === 'alert').at(-1);
    assert.equal(listCall.query.where, countCall.query.where); assert.equal(listCall.query.take, 17);
  }
  const last = await service.listAlerts(actor, { page: 1000000, limit: 127 }); assert.equal(last.page, 11); assert.equal(last.items.length, 57);
  const empty = await service.listAlerts(actor, { search: 'absent', page: 8, limit: 25 }); assert.equal(empty.page, 1); assert.equal(empty.total, 0);
  const legacy = await service.listAlerts(actor, {}); assert.equal(legacy.items.length, 1327); assert.equal(legacy.page, 1);
  assert.equal(calls.filter((c) => c.kind === 'alert').at(-1).query.take, undefined);
  await assert.rejects(service.listAlerts(actor, { client_id: 'client-b', page: 1 }), /forbidden/);
  await assert.rejects(service.listAlerts(actor, { node_id: 'other-hidden', page: 1 }), /forbidden/);
  for (const bad of [{ page: 0 }, { page: 1.2 }, { page: 1000001 }, { limit: 0 }, { limit: 1.5 }, { limit: 1001 }]) await assert.rejects(service.listAlerts(actor, bad), /Invalid/);
});

test('HTTP DTOs reject fractional/oversized paging and preserve optional legacy queries', async () => {
  const apiRequire = createRequire(resolve('apps/api/package.json'));
  const { validate } = apiRequire('class-validator');
  const { plainToInstance } = apiRequire('class-transformer');
  for (const [file, symbol] of [['nodes/dto/list-nodes-query.dto', 'ListNodesQueryDto'], ['alerts/dto/list-alerts-query.dto', 'ListAlertsQueryDto']]) {
    const Dto = loadApi(file)[symbol];
    assert.equal((await validate(plainToInstance(Dto, {}))).length, 0);
    for (const limit of ['0', '1.2', '1001']) assert.ok((await validate(plainToInstance(Dto, { limit }))).length > 0);
    assert.equal((await validate(plainToInstance(Dto, { limit: '50' }))).length, 0);
  }
});

const pageFixture = (ids, extra = {}) => ({ generated_at: time.toISOString(), total: 1327, limit: 50, next_cursor: 'next-synthetic', previous_cursor: null,
  items: ids.map((i) => ({ id: `node-${i}`, node_uid: `fw-${i}`, hostname: `fw-${i}`, display_name: null, client: { id: 'client-a', code: 'SYN', name: 'Synthetic' }, site: { code: 'LAB', name: 'Lab' }, effective_status: 'online', tags: [], backup_status: 'ok', node_uid_status: 'active' })), ...extra });

function browserMock(result) { return { result, search: '', loading: false, error: null, setSearch() {}, navigate() {} }; }

test('inventory forwards cursor/filter/order and resets selection when changing pages; pagination links retain filters', async () => {
  let query;
  const result = pageFixture([1301, 1302], { previous_cursor: 'prev-synthetic' });
  const mocks = { ...uiMocks, '@/components/nodes/fleet-inventory-section': { FleetInventorySection: 'fleet' },
    '@/components/node-pagination': { NodePagination: 'pager' },
    '@/lib/api': { getNodesList: async (q) => { query = q; return result; }, getNodesFilters: async () => ({ clients: [], sites: [], tags: [], groups: [] }), getSession: async () => ({ user: { role: 'readonly' }, permissions: [] }), getPackageRelease: async () => ({ version: '0.5.25' }) } };
  const page = sourceLoader(mocks)('app/nodes/page.tsx').default;
  const params = { cursor: 'synthetic-cursor', client_id: 'client-a', search: 'fw', sort_by: 'backup', sort_order: 'desc', preset: 'problem' };
  const tree = await page({ searchParams: Promise.resolve(params) });
  assert.equal(query.limit, 50); assert.equal(query.cursor, params.cursor); assert.equal(query.preset, 'problem'); assert.equal(query.sort_order, 'desc');
  const fleet = elements(tree).find((e) => e.type === 'fleet'); assert.equal(fleet.props.nodes[0].id, 'node-1301'); assert.match(fleet.key, /synthetic-cursor/);
  const { NodePagination } = sourceLoader(uiMocks)('components/node-pagination.tsx');
  const links = elements(NodePagination({ result, basePath: '/nodes', params })).filter((e) => e.type === 'a');
  for (const link of links) { const url = new URL(link.props.href, 'https://synthetic.invalid'); assert.equal(url.searchParams.get('search'), 'fw'); assert.equal(url.searchParams.get('preset'), 'problem'); }
  assert.equal(new URL(links[0].props.href, 'https://synthetic.invalid').searchParams.has('cursor'), false);
});

test('token picker reaches node 1301, submits only explicit target and hides credential on page/search change', async () => {
  const hooks = hookHarness(); const result = pageFixture([1301, 1302]); const browser = browserMock(result); const calls = [];
  const { AgentTokenForm } = sourceLoader({ ...uiMocks, react: hooks.react, '@/lib/use-paged-nodes': { usePagedNodes: () => browser },
    '@/components/node-browser-controls': { NodeBrowserControls: 'browser' },
    '@/lib/admin': { createAgentTokenAction: async (form) => { calls.push(form.get('node_id')); return { ok: true, token: 'SYNTHETIC_EPHEMERAL', hint: 'fake' }; } },
  })('components/agent-token-form.tsx');
  const props = { nodes: [], initialPage: result }; let tree = hooks.render(AgentTokenForm, props);
  assert.ok(textOf(tree).includes('fw-1301'));
  elements(tree).find((e) => e.type === 'select').props.onChange({ target: { value: 'node-1301' } }); tree = hooks.render(AgentTokenForm, props);
  const form = new FormData(); form.set('node_id', 'node-1301'); await elements(tree).find((e) => e.type === 'form').props.action(form);
  tree = hooks.render(AgentTokenForm, props); assert.match(textOf(tree), /SYNTHETIC_EPHEMERAL/); assert.deepEqual(calls, ['node-1301']);
  elements(tree).find((e) => e.type === 'browser').props.onChange(); tree = hooks.render(AgentTokenForm, props);
  assert.ok(!textOf(tree).includes('SYNTHETIC_EPHEMERAL')); assert.equal(elements(tree).find((e) => e.type === 'select').props.value, '');
  browser.loading = true; tree = hooks.render(AgentTokenForm, props); await elements(tree).find((e) => e.type === 'form').props.action(form); assert.equal(calls.length, 1);
});

test('technician targets persist explicit selections across pages with API cap; search never selects whole fleet', () => {
  const hooks = hookHarness(); const browser = browserMock(pageFixture([1, 2]));
  const { AdminTechnicianTargets } = sourceLoader({ ...uiMocks, react: hooks.react, '@/lib/use-paged-nodes': { usePagedNodes: () => browser },
    '@/components/node-browser-controls': { NodeBrowserControls: 'browser' }, '@/components/nodes/fleet-technician-management-panel': { FleetTechnicianManagementPanel: 'panel' },
  })('components/admin-technician-targets.tsx');
  const props = { nodes: [], batchMaxSize: 2, canManageTechnicians: true, canManageRegistry: false, canResetTechnicianPassword: true };
  let tree = hooks.render(AdminTechnicianTargets, props);
  assert.deepEqual(elements(tree).find((e) => e.type === 'panel').props.nodeIds, []);
  elements(tree).find((e) => e.props.type === 'checkbox').props.onChange();
  browser.result = pageFixture([1301, 1302]); tree = hooks.render(AdminTechnicianTargets, props);
  elements(tree).find((e) => e.props.type === 'checkbox').props.onChange(); tree = hooks.render(AdminTechnicianTargets, props);
  assert.deepEqual(elements(tree).find((e) => e.type === 'panel').props.nodeIds, ['node-1', 'node-1301']);
  const blocked = elements(tree).filter((e) => e.props.type === 'checkbox').at(-1); assert.equal(blocked.props.disabled, true); blocked.props.onChange();
  tree = hooks.render(AdminTechnicianTargets, props); assert.equal(elements(tree).find((e) => e.type === 'panel').props.nodeIds.length, 2);
});

test('alerts UI requests page 43 of 1327 and displays server totals/order without a second in-memory slice', async () => {
  let query;
  const items = [1301, 1302].map((i) => ({ id: `a-${i}`, title: `Alert ${i}`, status: 'open', severity: 'critical', opened_at: time.toISOString(), node: { id: 'node', hostname: 'lab' }, client: { name: 'Synthetic' }, site: { name: 'Lab' } }));
  const { default: page } = sourceLoader({ ...uiMocks, '@/lib/api': { getSession: async () => ({ permissions: ['alerts.view', 'alerts.resolve'] }), getNodesFilters: async () => ({ clients: [], sites: [] }), getAlertsList: async (q) => { query = q; return { generated_at: time.toISOString(), items, total: 1327, page: 43, total_pages: 54, totals: { open: 700, acknowledged: 400, critical: 300 } }; } }, '@/lib/alerts': {}, 'next/navigation': { redirect: () => assert.fail('unexpected redirect') } })('app/alerts/page.tsx');
  const tree = await page({ searchParams: Promise.resolve({ page: '43', per_page: '25', search: 'Synthetic', status: 'open' }) });
  assert.equal(query.page, 43); assert.equal(query.limit, 25); assert.equal(query.sort_by, 'attention');
  assert.match(textOf(tree), /Página\s+43\s+de\s+54/); assert.match(JSON.stringify(tree), /1327 registro/);
  const actions = elements(tree).filter((e) => e.type?.name === 'ActionForms'); assert.equal(actions.length, 2);
  assert.ok(actions[0].props.returnTo.includes('page=43')); assert.equal(actions[0].props.canResolveAlerts, true); assert.equal(actions[0].props.canAcknowledgeAlerts, false);
});

test('async node search discards stale replies, resets cursor on search and reports failure explicitly', async (t) => {
  const timers = new Map(); let timerId = 0; const calls = [];
  t.mock.method(globalThis, 'setTimeout', (fn) => { timers.set(++timerId, fn); return timerId; });
  t.mock.method(globalThis, 'clearTimeout', (id) => timers.delete(id));
  const hooks = hookHarness();
  const { usePagedNodes } = sourceLoader({ react: hooks.react, './node-options-action': { searchNodeOptions: (query) => { const d = deferred(); calls.push({ query, d }); return d.promise; } } })('lib/use-paged-nodes.ts');
  let browser; const Component = () => { browser = usePagedNodes(); return null; }; const render = () => hooks.render(Component);
  render(); timers.values().next().value();
  browser.setSearch('fw-1301'); render(); [...timers.values()].at(-1)();
  assert.equal(calls[1].query.cursor, undefined); assert.equal(calls[1].query.search, 'fw-1301');
  calls[1].d.resolve({ ok: true, result: pageFixture([1301]) }); await settle(); render(); assert.equal(browser.result.items[0].id, 'node-1301');
  calls[0].d.resolve({ ok: true, result: pageFixture([1]) }); await settle(); render(); assert.equal(browser.result.items[0].id, 'node-1301');
  browser.navigate('next-synthetic'); render(); [...timers.values()].at(-1)(); assert.equal(calls[2].query.cursor, 'next-synthetic');
  calls[2].d.resolve({ ok: false, error: 'Synthetic failure' }); await settle(); render(); assert.equal(browser.result, undefined); assert.equal(browser.error, 'Synthetic failure');
  hooks.unmount();
});

test('group editing preserves 1201 off-page memberships and an explicit target beyond 1000', async () => {
  const hooks = hookHarness(); const browser = browserMock(pageFixture([1301])); let saved;
  const { GroupMemberPicker } = sourceLoader({ ...uiMocks, './ui': uiMocks['@/components/ui'], react: hooks.react,
    '@/lib/use-paged-nodes': { usePagedNodes: () => browser }, './node-browser-controls': { NodeBrowserControls: 'browser' },
    '@/lib/fleet-org-actions': { updateGroupMembersAction: async (_, ids) => { saved = ids; return { ok: true }; } }, 'next/navigation': { useRouter: () => ({ refresh() {} }) },
  })('components/group-member-picker.tsx');
  const props = { groupId: 'group-a', clientId: 'client-a', memberIds: Array.from({ length: 1201 }, (_, i) => `node-${i}`) };
  let tree = hooks.render(GroupMemberPicker, props); elements(tree).find((e) => e.props.type === 'checkbox').props.onChange(); tree = hooks.render(GroupMemberPicker, props);
  await elements(tree).find((e) => e.type === 'button' && textOf(e) === 'Salvar membros').props.onClick();
  assert.equal(saved.length, 1202); assert.ok(saved.includes('node-0')); assert.ok(saved.includes('node-1200')); assert.ok(saved.includes('node-1301'));
});
