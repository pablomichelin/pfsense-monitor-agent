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
