import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, hookHarness, elements, textOf, settle, deferred } from './source-harness.mjs';

test('F03 login next is always same-origin and cannot reach an external host', () => {
  const { sanitizeInternalPath } = sourceLoader()('lib/internal-path.ts');
  for (const candidate of ['/\\outside.example/path', '//outside.example', '/\u0000outside',
    '/login', '/login?next=/', '/api/v1/nodes']) {
    assert.equal(sanitizeInternalPath(candidate), null, candidate);
  }
  for (const candidate of ['/nodes?tab=backup', '/dashboard', '/nodes#status']) {
    const accepted = sanitizeInternalPath(candidate);
    assert.ok(accepted);
    assert.equal(new URL(accepted, 'https://monitor.example').origin, 'https://monitor.example');
  }
});

test('node list cursor errors return to page one with the rest of the URL intact', () => {
  class ApiError extends Error {
    constructor(message, status, code) { super(message); this.status = status; this.code = code; }
  }
  const { handlePageApiError } = sourceLoader({
    '@/lib/api': { ApiError },
    'next/navigation': { redirect: (url) => { throw Object.assign(new Error('Redirect'), { url }); } },
  })('lib/handle-page-api-error.ts');
  const state = {
    pathname: '/bootstrap',
    searchParams: { cursor: 'expired', node_id: 'target-qa', search: 'QA site', bucket: 'active', heartbeat_mode: 'light' },
  };
  const check = expected => error => {
    assert.equal(error.url, expected);
    return true;
  };
  const old = new ApiError('Cursor inválido ou incompatível com os filtros. Reinicie a listagem.', 400);
  const current = new ApiError('Synthetic status', 400, 'INVALID_NODE_CURSOR');
  assert.throws(() => handlePageApiError(old, state), check('/bootstrap?node_id=target-qa&search=QA+site&bucket=active&heartbeat_mode=light'));
  assert.throws(() => handlePageApiError(current, {
    pathname: '/nodes', searchParams: { cursor: 'old', sort_by: 'status', search: 'QA' },
  }), check('/nodes?sort_by=status&search=QA'));
  assert.throws(() => handlePageApiError(current, { ...state, searchParams: {} }), error => error === current);
  const other = new ApiError('invalid fields', 400);
  assert.throws(() => handlePageApiError(other, state), error => error === other);
  assert.throws(() => handlePageApiError(new ApiError('denied', 403), state), check('/conta?access=denied'));

  const users = {
    pathname: '/admin/usuarios',
    searchParams: { cursor: 'expired', search: 'QA users', showInactive: '1', tab: 'users' },
  };
  for (const message of ['invalid user cursor', 'cursor must be a UUID']) {
    const invalidUserCursor = new ApiError(message, 400);
    assert.throws(() => handlePageApiError(invalidUserCursor, users),
      check('/admin/usuarios?search=QA+users&showInactive=1&tab=users'));
    assert.throws(() => handlePageApiError(invalidUserCursor, state), error => error === invalidUserCursor);
  }
  assert.throws(() => handlePageApiError(current, users), error => error === current);
  assert.throws(() => handlePageApiError(other, users), error => error === other);
});

function bootstrapFixture(items, selectedId, cursor) {
  const calls = [];
  const page = sourceLoader({
    ...uiMocks,
    '@/components/node-pagination': { NodePagination: 'pagination' },
    '@/components/nodes/installation-badge': { InstallationBadge: 'installation-badge' },
    '@/lib/form-field-styles': { formInputClassName: '', formSelectClassName: '' },
    '@/lib/authz': { hasPermission: () => true },
    '@/lib/handle-page-api-error': { handlePageApiError: (error) => { throw error; } },
    '@/lib/format': { formatDateTime: String, formatRelativeAge: String },
    'next/navigation': { redirect: (url) => { throw new Error(`unexpected redirect: ${url}`); } },
    '@/lib/api': {
      ApiError: class ApiError extends Error {},
      getSession: async () => ({ permissions: ['bootstrap.view'] }),
      getNodesList: async (query) => { calls.push(['list', query]); return { items, total: items.length, next_cursor: null }; },
      getNodesFilters: async () => ({ clients: [], sites: [] }),
      getNodeBootstrapCommand: async (id) => { calls.push(['command', id]); return null; },
    },
  })('app/bootstrap/page.tsx').default;
  return { page: () => page({ searchParams: Promise.resolve({ node_id: selectedId, cursor }) }), calls };
}

test('F01 second-page bootstrap keeps cursor, never substitutes a requested node', async () => {
  const node = (id) => ({ id, node_uid: id, hostname: id, client: { name: 'Lab' },
    site: { name: 'Site' }, node_uid_status: 'active', agent_version: null });
  const second = bootstrapFixture([node('firewall-B')], 'firewall-B', 'page-2');
  const tree = await second.page();
  assert.deepEqual(second.calls.find((call) => call[0] === 'command'), ['command', 'firewall-B']);
  assert.equal(elements(tree).find((element) => element.type === 'input' && element.props.name === 'cursor').props.value, 'page-2');
  assert.match(textOf(tree), /firewall-B/);
  const missing = bootstrapFixture([node('firewall-A')], 'firewall-B', undefined);
  const missingTree = await missing.page();
  assert.ok(missing.calls.every((call) => call[0] !== 'command'));
  assert.match(textOf(missingTree), /não está nesta página/);
});

test('F04 dashboard requests offline/degraded before limiting attention results', async () => {
  const calls = [];
  const offline = { id: 'firewall-201', hostname: 'firewall-201', effective_status: 'offline' };
  const page = sourceLoader({ ...uiMocks,
    '@/components/dashboard/dashboard-kpi-grid': { DashboardKpiGrid: 'kpis' },
    '@/components/dashboard/fleet-version-matrix': { FleetVersionMatrix: 'versions' },
    '@/components/hot-zone-expandable-list': { HotZoneExpandableList: 'hot-zone' },
    '@/lib/cn': { cn: (...args) => args.join(' ') },
    '@/lib/client-profile': { isClientRole: () => false },
    '@/lib/handle-page-api-error': { handlePageApiError: (error) => { throw error; } },
    '@/lib/api': {
      getSession: async () => ({ user: { role: 'admin' } }),
      getDashboardFleet: async () => ({ generated_at: '2026-11-02', totals: { offline: 1, degraded: 0 },
        version_matrix: { pfsense: [], package: [] }, compliance: { package_target_version: null } }),
      getNodesList: async (query) => { calls.push(query); return { items: query.status === 'offline' ? [offline] : [] }; },
    },
  })('app/dashboard/page.tsx').default;
  const tree = await page();
  assert.deepEqual(calls.map((query) => query.status).sort(), ['degraded', 'offline']);
  assert.equal(elements(tree).find((element) => element.type === 'hot-zone').props.nodes[0].id, 'firewall-201');
  assert.ok(!textOf(tree).includes('Nenhum firewall offline'));
});

test('dashboard keeps fleet totals and the available attention rows during a partial outage', async () => {
  class ApiError extends Error {
    constructor(status) { super('synthetic request failure'); this.status = status; }
  }
  let status = 503;
  let totals = { offline: 1, degraded: 1 };
  const offline = { id: 'qa-offline', hostname: 'qa-offline', effective_status: 'offline' };
  const page = sourceLoader({
    ...uiMocks,
    '@/components/dashboard/dashboard-kpi-grid': { DashboardKpiGrid: 'kpis' },
    '@/components/dashboard/fleet-version-matrix': { FleetVersionMatrix: 'versions' },
    '@/components/hot-zone-expandable-list': { HotZoneExpandableList: 'hot-zone' },
    '@/lib/client-profile': { isClientRole: () => false },
    '@/lib/handle-page-api-error': { handlePageApiError: (error) => { throw error; } },
    '@/lib/api': {
      ApiError,
      getSession: async () => ({ user: { role: 'admin' } }),
      getDashboardFleet: async () => ({
        generated_at: '2026-11-02',
        totals,
        version_matrix: { pfsense: [], package: [] },
        compliance: { package_target_version: null },
      }),
      getNodesList: async ({ status: filter }) => {
        if (filter === 'degraded') throw new ApiError(status);
        return { items: [offline] };
      },
    },
  })('app/dashboard/page.tsx').default;
  const tree = await page();
  assert.equal(elements(tree).find((element) => element.type === 'kpis').props.fleet.totals.degraded, 1);
  assert.equal(elements(tree).find((element) => element.type === 'hot-zone').props.nodes[0].id, offline.id);
  assert.match(textOf(tree), /Parte da lista de firewalls está temporariamente indisponível/);
  assert.doesNotMatch(textOf(tree), /Nenhum firewall offline/);
  totals = { offline: 0, degraded: 0 };
  const zeroTotals = await page();
  assert.match(textOf(zeroTotals), /Parte da lista de firewalls está temporariamente indisponível/);
  assert.doesNotMatch(textOf(zeroTotals), /Nenhum firewall offline/);
  assert.equal(elements(zeroTotals).find((element) => element.type === 'hot-zone').props.nodes[0].id, offline.id);
  status = 403;
  await assert.rejects(page, (error) => error instanceof ApiError && error.status === 403);
});

test('audit respects the end of a full page and clamps malformed or unsupported offsets', async () => {
  let hasMore = false;
  const reads = [];
  const page = sourceLoader({
    ...uiMocks,
    '@/components/audit-event-row': { AuditEventRow: 'audit-event' },
    '@/lib/handle-page-api-error': { handlePageApiError: (error) => { throw error; } },
    '@/lib/api': {
      getSession: async () => ({ permissions: ['audit.view'] }),
      getAuditLogs: async (filters) => {
        reads.push(filters);
        return { has_more: hasMore, items: Array.from({ length: 50 }, (_, index) => ({ id: index })) };
      },
    },
  })('app/audit/page.tsx').default;
  const browse = (offset) => page({ searchParams: Promise.resolve({ offset, limit: '50' }) });
  assert.doesNotMatch(textOf(await browse('Infinity')), /Próxima página/);
  assert.equal(reads.at(-1).offset, 0);
  hasMore = true;
  const limited = await browse('10001');
  assert.equal(reads.at(-1).offset, 10_000);
  assert.doesNotMatch(textOf(limited), /Próxima página/);
  assert.match(textOf(limited), /limite de navegação/);
  hasMore = undefined;
  assert.match(textOf(await browse('50')), /Próxima página/);
});

test('audit pagination preserves the relative period while browsing', async ({ mock }) => {
  const initial = Date.parse('2026-11-26T02:00:00.000Z');
  mock.timers.enable({ apis: ['Date'], now: initial });
  const reads = [];
  const page = sourceLoader({
    ...uiMocks,
    '@/components/audit-event-row': { AuditEventRow: 'audit-event' },
    '@/lib/handle-page-api-error': { handlePageApiError: error => { throw error; } },
    '@/lib/api': {
      getSession: async () => ({ permissions: ['audit.view'] }),
      getAuditLogs: async (query) => {
        reads.push(query);
        return { has_more: true, items: Array.from({ length: 25 }, (_, index) => ({ id: index })) };
      },
    },
  })('app/audit/page.tsx').default;
  const firstQuery = { period: '24h', limit: '25' };
  const render = query => page({ searchParams: Promise.resolve(query) });
  const first = await render(firstQuery);
  const next = elements(first).find(element => element.props?.href?.includes('offset=25'));
  assert.ok(next);
  mock.timers.tick(90_000);
  const follow = Object.fromEntries(new URL(next.props.href, 'https://qa.example.invalid').searchParams);
  await render(follow);
  assert.equal(reads[1].offset, 25);
  assert.equal(reads[1].from, reads[0].from);
  assert.equal(reads[1].to, reads[0].to);
  await render(firstQuery);
  assert.equal(Date.parse(reads[2].to) - Date.parse(reads[0].to), 90_000);
  await render({ ...firstQuery, offset: '25', period_end: '-271821-04-20T00:00:00.000Z' });
  assert.equal(reads[3].to, reads[2].to);
});

test('audit custom calendar days match Brasília and invalid periods stay on the form', async () => {
  const { resolveAuditDateBounds } = sourceLoader()('lib/audit-labels.ts');
  assert.deepEqual(resolveAuditDateBounds('2026-11-25', '2026-11-25'), {
    from: '2026-11-25T03:00:00.000Z', to_before: '2026-11-26T03:00:00.000Z',
  });
  assert.deepEqual(resolveAuditDateBounds('2018-11-04', '2018-11-04'), {
    from: '2018-11-04T03:00:00.000Z', to_before: '2018-11-05T02:00:00.000Z',
  });
  assert.equal(resolveAuditDateBounds('2026-02-30'), null);
  assert.equal(resolveAuditDateBounds('2026-02-30T12:00:00Z'), null);
  assert.equal(resolveAuditDateBounds('2026-11-25T15:00:00'), null);
  assert.deepEqual(resolveAuditDateBounds(undefined, '2026-11-25T15:00:00Z'), {
    from: undefined, to: '2026-11-25T15:00:00.000Z',
  });

  const filters = [];
  const page = sourceLoader({
    ...uiMocks,
    '@/components/audit-event-row': { AuditEventRow: 'audit-event' },
    '@/lib/handle-page-api-error': { handlePageApiError: (error) => { throw error; } },
    '@/lib/api': {
      getSession: async () => ({ permissions: ['audit.view'] }),
      getAuditLogs: async (query) => {
        filters.push(query);
        return { items: [], has_more: false };
      },
    },
  })('app/audit/page.tsx').default;
  const tree = await page({ searchParams: Promise.resolve({ period: 'custom', from: '2026-11-26', to: '2026-11-25' }) });
  assert.equal(filters.length, 0);
  assert.match(textOf(tree), /Informe datas válidas/);
  assert.doesNotMatch(textOf(tree), /Nenhum evento encontrado/);
  const withInstant = await page({ searchParams: Promise.resolve({ to: '2026-11-25T15:00:00Z' }) });
  const toInput = elements(withInstant).find((element) => element.type === 'input' && element.props.name === 'to');
  assert.equal(toInput.props.type, 'text');
  assert.equal(toInput.props.defaultValue, '2026-11-25T15:00:00Z');
  assert.equal(filters[0].to, '2026-11-25T15:00:00.000Z');
});

test('metric charts reserve time for missing measurements without marking a measured zero as missing', () => {
  const point = (hour, cpu) => ({ bucket_start: `2026-11-26T0${hour}:00:00.000Z`, sample_count: 1, cpu_avg: cpu });
  const history = {
    enabled: true, granularity: 'hourly', from: '2026-11-26T00:30:00.000Z', to: '2026-11-26T04:30:00.000Z',
    points: [point(1, 0), point(2, null), point(4, 50)], summary: { cpu_avg: 25 },
  };
  const { NodeMetricsTrendsPanel } = sourceLoader({
    ...uiMocks,
    'next/navigation': {
      useRouter: () => ({}), usePathname: () => '/nodes/qa-node', useSearchParams: () => new URLSearchParams(),
    },
  })('components/nodes/node-metrics-trends-panel.tsx');
  const tree = NodeMetricsTrendsPanel({ nodeId: 'qa-node', history, activePeriod: '24h' });
  const cpu = elements(tree).find(element => typeof element.type === 'function' && element.props.metric === 'cpu_avg');
  const bars = elements(cpu.type(cpu.props)).filter(element => element.props?.title);
  assert.equal(bars.length, 4);
  assert.match(bars[0].props.title, /01:00:00.000Z: 0/);
  assert.match(bars[0].props.className, /bg-cyan/);
  for (const index of [1, 2]) {
    assert.match(bars[index].props.title, /sem medição/);
    assert.doesNotMatch(bars[index].props.className, /bg-cyan/);
  }
  assert.match(bars[2].props.title, /03:00:00.000Z/);
  assert.match(bars[3].props.title, /04:00:00.000Z: 50/);
  assert.equal(elements(tree).filter(element => element.type === 'tr').length, 4);
});

test('F05 detail with view-only permission never requests backups or tags', async () => {
  const calls = [];
  const node = { id: 'node', hostname: 'lab', node_uid: 'lab-uid', effective_status: 'online',
    client: { id: 'client', name: 'Lab' }, site: { name: 'Site' }, pfsense_version: '2.9.0' };
  const helper = {
    buildAuditHref: () => '/audit', normalizeConfigBackupInstallMode: () => 'default',
    normalizeHeartbeatMode: () => 'normal', normalizeNodeDetailTab: () => 'overview',
    operationalStatusLabel: String, statusHeroTone: () => 'default', toOperationalStatusBadge: () => 'online',
  };
  const components = Object.fromEntries([
    'delete-node-button', 'realtime-refresh', 'nodes/node-command-history-panel', 'nodes/node-operational-actions-section',
    'nodes/node-detail-alerts-tab', 'nodes/node-detail-backup-tab', 'nodes/node-detail-config-tab',
    'nodes/node-detail-metrics-tab', 'nodes/node-detail-overview-tab', 'nodes/node-technician-accounts-panel',
    'nodes/node-detail-tabs', 'ui/status-badge',
  ].map((name) => [`@/components/${name}`, new Proxy({}, { get: () => name })]));
  const page = sourceLoader({ ...uiMocks, ...components,
    '@/lib/node-detail-helpers': helper,
    '@/lib/metrics-history': { normalizeMetricsHistoryPeriod: () => '24h' },
    '@/lib/client-profile': { isClientRole: () => false },
    '@/lib/authz': { hasPermission: (permissions, permission) => permissions.includes(permission) },
    '@/lib/handle-page-api-error': { handlePageApiError: (error) => { throw error; } },
    '@/lib/format': { formatRelativeAge: String },
    'next/navigation': { notFound: () => { throw new Error('404'); }, redirect: () => { throw new Error('redirect'); } },
    '@/lib/api': {
      ApiError: class ApiError extends Error {}, getNodeDetails: async () => ({ node, generated_at: '2026-11-02' }),
      getSession: async () => ({ permissions: ['firewalls.view'], user: { role: 'viewer' } }),
      getNodeConfigBackups: async () => { calls.push('backups'); throw new Error('unauthorized backup'); },
      listFleetTags: async () => { calls.push('tags'); throw new Error('unauthorized tags'); },
      getPfsenseUpgradeStatus: async () => ({}), getPackageUpgradeStatus: async () => ({}),
      getNodeMetricsHistory: async () => ({}), getNodeCommandHistory: async () => ({ items: [] }),
      getOperationalActionsStatus: async () => ({ enabled: false }),
    },
  })('app/nodes/[id]/page.tsx').default;
  const tree = await page({ params: Promise.resolve({ id: 'node' }), searchParams: Promise.resolve({}) });
  assert.deepEqual(calls, []);
  const tab = elements(tree).find((element) => element.type === 'nodes/node-detail-tabs');
  assert.ok(tab);
  assert.ok(!tab.props.tabs.some((item) => item.id === 'backup'));
});

test('F06 URL navigation and browser history choose the displayed tab', () => {
  const query = { value: 'tab=overview' };
  const hooks = hookHarness();
  const { NodeDetailTabs } = sourceLoader({ ...uiMocks, react: hooks.react,
    'next/navigation': {
      useRouter: () => ({ replace: (path) => { query.value = path.split('?')[1] ?? ''; } }),
      usePathname: () => '/nodes/lab',
      useSearchParams: () => new URLSearchParams(query.value),
    },
    '@/lib/cn': { cn: (...args) => args.join(' ') },
  })('components/nodes/node-detail-tabs.tsx');
  const props = { tabs: [{ id: 'overview', label: 'Visão' }, { id: 'backup', label: 'Backup' }],
    initialTab: 'overview', overview: 'PANEL-OVERVIEW', backup: 'PANEL-BACKUP' };
  assert.match(textOf(hooks.render(NodeDetailTabs, props)), /PANEL-OVERVIEW/);
  query.value = 'tab=backup';
  assert.match(textOf(hooks.render(NodeDetailTabs, props)), /PANEL-BACKUP/);
  query.value = '';
  assert.match(textOf(hooks.render(NodeDetailTabs, props)), /PANEL-OVERVIEW/);
});

test('F07 a new server history snapshot appears even with no original active command', () => {
  const hooks = hookHarness();
  const { NodeCommandHistoryPanel } = sourceLoader({ ...uiMocks, react: hooks.react,
    '@/lib/node-commands-actions': { fetchNodeCommandHistory: async () => ({ items: [] }) },
    '@/lib/format': { formatRelativeAge: String, formatDateTime: String },
    '@/components/nodes/node-command-progress': { NodeCommandProgress: 'progress', commandTypeLabel: String },
  })('components/nodes/node-command-history-panel.tsx');
  const props = { nodeId: 'firewall', initialHistory: { items: [] }, canCancelBackup: false };
  hooks.render(NodeCommandHistoryPanel, props);
  assert.match(textOf(hooks.render(NodeCommandHistoryPanel, props)), /Nenhum comando registrado/);
  const updated = { ...props, initialHistory: { items: [{ command_id: 'new', type: 'config_backup_now', status: 'pending',
    progress: { is_active: true, phase: 'pending' }, requested_at: '2026-11-02', completed_at: null, max_retries: 0 }] } };
  hooks.render(NodeCommandHistoryPanel, updated);
  assert.ok(elements(hooks.render(NodeCommandHistoryPanel, updated)).some((element) => element.type === 'progress'));
  hooks.unmount();
});

test('F08 failed backup status read schedules another read without resending backup', async (t) => {
  const hooks = hookHarness();
  const timers = [];
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {} };
  t.after(() => { globalThis.window = originalWindow; });
  let reads = 0, writes = 0;
  const { NodeConfigBackupsSection } = sourceLoader({ ...uiMocks, react: hooks.react,
    '@/lib/backups': {
      requestConfigBackupAction: async () => { writes += 1; return { command_id: 'backup-command', status: 'pending', expires_at: '2026-11-03' }; },
      pollConfigBackupCommandAction: async () => { reads += 1; if (reads === 1) throw new Error('temporary');
        return { command_id: 'backup-command', status: 'succeeded', result_json: null }; },
    },
    '@/components/backup-download-button': { BackupDownloadButton: 'download' },
    '@/components/backups/backup-advanced-panel': { BackupDriftIndicator: 'drift', BackupRetentionPolicyForm: 'retention' },
    '@/components/backups/backup-diff-viewer': { BackupDiffViewer: 'diff' },
    '@/lib/format': { formatBackupAge: String, formatBytes: String, formatDateTime: String, shortSha256: String },
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    'next/link': { __esModule: true, default: 'a' },
  })('components/node-config-backups-section.tsx');
  const props = { nodeId: 'firewall', nodeEffectiveStatus: 'online', canRequest: true, canDownload: false,
    canManage: false, initialBackups: { items: [], visual_status: 'never', summary: { latest_received_at: null } } };
  let tree = hooks.render(NodeConfigBackupsSection, props);
  elements(tree).find((element) => element.type === 'button' && textOf(element).includes('Solicitar backup')).props.onClick();
  await settle();
  tree = hooks.render(NodeConfigBackupsSection, props);
  assert.equal(writes, 1);
  assert.equal(reads, 1);
  assert.match(textOf(tree), /Consulta temporariamente indisponível/);
  assert.equal(timers.length, 1);
  timers.shift()();
  await settle();
  assert.equal(reads, 2);
  assert.equal(writes, 1);
  hooks.unmount();
});

test('F02/F09 batch result keeps original technician and polling ends at terminal states', async (t) => {
  const hooks = hookHarness();
  const previousWindow = globalThis.window;
  let timer = null;
  globalThis.window = {
    setInterval: (callback) => { timer = callback; return 1; },
    clearInterval: () => { timer = null; },
  };
  t.after(() => { globalThis.window = previousWindow; });
  const waitingAccounts = deferred();
  const provisionResult = deferred();
  let requests = 0;
  const { FleetTechnicianManagementPanel } = sourceLoader({ ...uiMocks, react: hooks.react,
    '@/lib/technicians': {
      listTechniciansAction: async () => ({ batch_max_size: 2,
        items: ['T1', 'T2'].map((id) => ({ id, full_name: id, login_username: id, node_account_count: 1 })) }),
      createTechnicianBatchProvisionAction: () => provisionResult.promise,
      pollBackupCommandStatusAction: async () => ({ status: 'succeeded', error_message: null }),
      pollNodeTechnicianAccountsAction: async () => {
        requests += 1;
        if (requests === 1) return waitingAccounts.promise;
        return { items: [{ technician_id: 'T1', status: 'active' }] };
      },
    },
    '@/lib/technician-batch-limit': { technicianBatchLimit: (value) => value ?? null },
    '@/lib/pfsense-username': { isValidManagedPfsenseUsername: () => true },
  })('components/nodes/fleet-technician-management-panel.tsx');
  const props = { nodeIds: ['node-1'], mode: 'selection', canManageTechnicians: true,
    canManageRegistry: false, canResetTechnicianPassword: true };
  const render = () => hooks.render(FleetTechnicianManagementPanel, props);
  let tree = render();
  await settle();
  tree = render();
  const button = (label) => elements(tree).find((element) => element.type === 'button' && textOf(element).replace(/\s+/g, ' ').includes(label));
  button('Provisionar em').props.onClick();
  tree = render();
  elements(tree).find((element) => element.type === 'input' && element.props.placeholder === 'CONFIRMAR')
    .props.onChange({ target: { value: 'CONFIRMAR' } });
  tree = render();
  button('Confirmar provisionar').props.onClick();
  tree = render();
  elements(tree).find((element) => element.type === 'select' && element.props.value === 'T1')
    .props.onChange({ target: { value: 'T2' } });
  tree = render();
  provisionResult.resolve({ ok: true, data: {
    generated_at: '2026-11-02', batch: null, technician: { id: 'T1', full_name: 'T1' },
    results: [{ node_id: 'node-1', hostname: 'Lab', outcome: 'backup_queued', command_id: 'backup-1', reason: null }],
    summary: { enqueued: 0, backup_queued: 1, skipped: 0, failed: 0 },
  } });
  await settle();
  tree = render();
  await settle();
  tree = render();
  assert.equal(requests, 1);
  waitingAccounts.resolve({ items: [{ technician_id: 'T1', status: 'pending_create' },
    { technician_id: 'T2', status: 'active' }] });
  await settle();
  tree = render();
  assert.ok(!textOf(tree).includes('Provisionado'));
  assert.match(textOf(tree), /T1/);
  assert.ok(timer, 'pipeline must continue while T1 is pending');
  timer();
  await settle();
  tree = render();
  assert.match(textOf(tree), /Provisionado/);
  assert.equal(timer, null, 'terminal pipeline should clear polling');
  hooks.unmount();
});
