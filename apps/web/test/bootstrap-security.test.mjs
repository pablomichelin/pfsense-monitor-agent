import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceLoader, uiMocks, elements, textOf } from './source-harness.mjs';

test('evidence excludes both command representations and strips URL credentials', () => {
  const { buildBootstrapEvidenceBlock, shellQuote } = sourceLoader()('lib/bootstrap-command-helpers.ts');
  const output = buildBootstrapEvidenceBlock({ nodeId: 'fw1', nodeUid: 'uid1', hostname: 'lab\ninjected: text',
    pfsenseVersion: '2.9', releaseVersion: '0.5.26', artifactUrl: 'https://user:secret@example.test/release?token=SECRET#SECRET',
    checksumUrl: null, installerUrl: null, releaseBaseUrl: 'bad SECRET', controllerUrl: 'http://user:SECRET@example.test',
    bootstrapCommand: 'env MONITOR_UPDATE_NODE_SECRET=SECRET', package_command: 'printf SECRET', command: 'SECRET' });
  assert.doesNotMatch(output, /SECRET|user:secret|\ninjected:/);
  assert.match(output, /https:\/\/example.test\/release/);
  assert.match(output, /OMITIDO/);
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});

function fixture(permissions, errorStatus, listResponse = {}) {
  let revealCount = 0;
  let query;
  class ApiError extends Error { constructor(status) { super('synthetic'); this.status = status; } }
  const node = { id: 'fw1', hostname: 'lab', node_uid: 'uid1', node_uid_status: 'active', agent_version: '0.5.26',
    pfsense_version: '2.9', last_seen_at: null, client: { name: 'Client' }, site: { name: 'Site' } };
  const bootstrap = { node, heartbeat_mode: 'normal', release: { version: '0.5.26', artifact_name: 'release',
    artifact_url: null, installer_url: null, checksum_url: null, release_base_url: null, controller_url: 'https://pfs-monitor.systemup.inf.br' },
    package_command: 'synthetic secret command', command: null, verification: { command_block: 'status' } };
  const { default: Page } = sourceLoader({ ...uiMocks,
    '@/lib/api': { ApiError, getSession: async () => ({ permissions }),
      getNodesList: async (input) => { query = input; return { items: [node], total: 1, next_cursor: null, ...listResponse }; },
      getNodesFilters: async () => ({ clients: [], sites: [] }),
      getNodeBootstrapCommand: async () => { revealCount++; if (errorStatus) throw new ApiError(errorStatus); return bootstrap; } },
    '@/lib/handle-page-api-error': { handlePageApiError: (e) => { throw e; } },
    'next/navigation': { redirect: () => { throw new Error('redirect'); } },
    '@/components/node-pagination': { NodePagination: 'pagination' },
    '@/components/nodes/installation-badge': { InstallationBadge: 'installation' },
  })('app/bootstrap/page.tsx');
  return { Page, get query() { return query; }, get revealCount() { return revealCount; } };
}

test('view-only selection keeps context and never requests the credential', async () => {
  const f = fixture(['bootstrap.view', 'firewalls.view']);
  const tree = await f.Page({ searchParams: Promise.resolve({ node_id: 'fw1' }) });
  assert.equal(f.revealCount, 0);
  assert.match(textOf(tree), /bootstrap.execute/);
  assert.doesNotMatch(textOf(tree), /synthetic secret command/);
});

test('execute selection passes bucket to server; offline registered node is called installed', async () => {
  const f = fixture(['bootstrap.view', 'bootstrap.execute', 'firewalls.view']);
  const tree = await f.Page({ searchParams: Promise.resolve({ node_id: 'fw1', bucket: 'active', cursor: 'C2' }) });
  assert.equal(f.revealCount, 1);
  assert.equal(f.query.bootstrap_bucket, 'active');
  assert.equal(f.query.cursor, 'C2');
  assert.match(textOf(tree), /instalados/i);
  assert.doesNotMatch(textOf(tree), /Agentes ativos|Agente ativo/);
  assert.ok(elements(tree).some((e) => e.type === 'copy-button' && e.props.value === 'synthetic secret command'));
});

test('rejected override is explained without exposing API response or secret', async () => {
  const f = fixture(['bootstrap.view', 'bootstrap.execute', 'firewalls.view'], 400);
  const tree = await f.Page({ searchParams: Promise.resolve({ node_id: 'fw1', controller_url: 'http://invalid.test' }) });
  assert.match(textOf(tree), /URL não aprovada/);
  assert.doesNotMatch(textOf(tree), /synthetic secret command/);
});

function componentMocks(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  return Object.fromEntries([...source.matchAll(/import \{([^}]+)\} from '(@\/components\/[^']+)';/g)]
    .map(([, names, module]) => [module, Object.fromEntries(names.split(',').map((name) => [name.trim(), name.trim()]))]));
}

test('node detail bootstrap permission matrix: view-only, execute-only, none and denied', async (t) => {
  for (const [name, permissions, denied] of [
    ['view-only', ['bootstrap.view'], false],
    ['execute-only', ['bootstrap.execute'], false],
    ['none', [], false],
    ['denied', ['bootstrap.execute'], true],
  ]) await t.test(name, async () => {
    const calls = [];
    const response = { command: 'SYNTHETIC_SECRET' };
    const empty = async () => null;
    const api = {
      ApiError: class extends Error {},
      getNodeDetails: async () => ({ generated_at: 'T', node: { id: 'fw1', node_uid: 'uid', hostname: 'lab',
        effective_status: 'offline', client: { id: 'c1', name: 'Client' }, site: { name: 'Site' } } }),
      getSession: async () => ({ user: { role: 'admin' }, permissions }),
      getNodeBootstrapCommandIfAllowed: async (...args) => { calls.push(args); return denied ? null : response; },
      getNodeConfigBackups: empty, getNodeCommandHistory: empty, getNodeCapabilities: empty,
      getOperationalActionsStatus: empty, getPfsenseApiStatus: empty, getNodeMetricsHistory: empty,
      getNodeTechnicianAccounts: empty, getPackageUpgradeStatus: empty, getPfsenseUpgradeStatus: empty,
      listFleetTags: empty,
    };
    const { default: Page } = sourceLoader({ ...uiMocks,
      ...componentMocks('../app/nodes/[id]/page.tsx'), '@/lib/api': api,
      'next/navigation': { redirect: () => { throw new Error('redirect'); }, notFound: () => { throw new Error('404'); } },
      '@/lib/handle-page-api-error': { handlePageApiError: (e) => { throw e; } },
    })('app/nodes/[id]/page.tsx');
    const tree = await Page({ params: Promise.resolve({ id: 'fw1' }), searchParams: Promise.resolve({ tab: 'config', heartbeat_mode: 'light', config_backup_enabled: 'yes' }) });
    const tabs = elements(tree).find((e) => e.type === 'NodeDetailTabs');
    const config = tabs.props.config.props;
    const execute = permissions.includes('bootstrap.execute');
    assert.equal(calls.length, execute ? 1 : 0);
    assert.equal(config.canExecuteBootstrap, execute);
    assert.equal(config.bootstrap, execute && !denied ? response : null);
    assert.equal(tabs.props.tabs.some((tab) => tab.id === 'config'), permissions.length > 0);
    if (execute) assert.deepEqual(calls[0], ['fw1', undefined, undefined, 'light', 'yes']);
  });
});

test('node config explains denied bootstrap while retaining the page', () => {
  const { NodeDetailConfigTab } = sourceLoader({ ...uiMocks,
    ...componentMocks('../components/nodes/node-detail-config-tab.tsx'),
    '@/lib/admin': { updateNodeAction: async () => {} },
  })('components/nodes/node-detail-config-tab.tsx');
  const tree = NodeDetailConfigTab({ node: { id: 'fw1', tags: [], client: { id: 'c1' } },
    canManageNode: false, canExecuteBootstrap: true, bootstrap: null, heartbeatMode: 'normal', configBackupInstallMode: 'default' });
  assert.match(textOf(tree), /não está disponível para este perfil/);
  assert.match(textOf(tree), /restante do cadastro continua acessível/);
});

test('bootstrap counts distinguish pre-bucket summary, bucket total and current page', async () => {
  const f = fixture(['bootstrap.view'], undefined, { total: 105,
    bootstrap_summary: { pending: 1000, active: 105, blocked: 7, total: 1112 } });
  const tree = await f.Page({ searchParams: Promise.resolve({ bucket: 'active' }) });
  const hero = elements(tree).find((e) => e.type === 'hero');
  assert.deepEqual(hero.props.stats.map((s) => s.value), ['1000', '105', '7']);
  assert.match(textOf(tree), /Nos filtros atuais — todos os estados\s*: 1112 firewalls/);
  assert.match(textOf(tree), /1 firewalls nesta página de 105 no estado selecionado/);
});

test('bootstrap counts fall back explicitly to current page without summary', async () => {
  const f = fixture(['bootstrap.view']);
  const tree = await f.Page({ searchParams: Promise.resolve({ bucket: 'active' }) });
  const hero = elements(tree).find((e) => e.type === 'hero');
  assert.deepEqual(hero.props.stats.map((s) => s.value), ['0', '1', '0']);
  assert.ok(hero.props.stats.every((s) => s.label.includes('na página')));
  assert.match(textOf(tree), /Nesta página — resumo completo indisponível/);
});
