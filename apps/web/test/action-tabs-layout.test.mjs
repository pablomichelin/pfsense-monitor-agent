import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, hookHarness, elements, textOf } from './source-harness.mjs';

function tabsHarness(props) {
  const harness = hookHarness();
  const { ActionTabs } = sourceLoader({ react: harness.react })('components/ui/action-tabs.tsx');
  let tree;
  const render = (next = props) => tree = harness.render(ActionTabs, next);
  render();
  return { render, get tree() { return tree; } };
}
const tabFixtures = [
  { id: 'history', label: 'Histórico', content: 'HISTORY_FORM' },
  { id: 'policy', label: 'Retenção', content: 'POLICY_FORM' },
  { id: 'token', label: 'Token', content: 'SECRET_VIEW', unmountOnHide: true },
];

test('abas mantêm formulários comuns e desmontam a exibição de segredo ao sair', () => {
  const h = tabsHarness({ id: 'test', label: 'Tarefas', tabs: tabFixtures });
  const buttons = () => elements(h.tree).filter((e) => e.props?.role === 'tab');
  const panels = () => elements(h.tree).filter((e) => e.props?.role === 'tabpanel');
  assert.equal(panels().filter((p) => !p.props.hidden).length, 1);
  assert.ok(textOf(h.tree).includes('POLICY_FORM'));
  assert.ok(!textOf(h.tree).includes('SECRET_VIEW'));
  buttons()[2].props.onClick(); h.render();
  assert.ok(textOf(h.tree).includes('SECRET_VIEW'));
  buttons()[0].props.onClick(); h.render();
  assert.ok(!textOf(h.tree).includes('SECRET_VIEW'));
  assert.ok(textOf(h.tree).includes('POLICY_FORM'));
});

test('retorno de formulário e mudança de permissões escolhem uma aba válida', () => {
  const props = { id: 'return', label: 'Tarefas', tabs: tabFixtures, initialTabId: 'policy' };
  const h = tabsHarness(props);
  let selected = () => elements(h.tree).find((e) => e.props?.role === 'tab' && e.props['aria-selected']);
  assert.equal(selected().props.id, 'return-tab-policy');
  h.render({ ...props, tabs: [tabFixtures[0]] });
  assert.equal(selected().props.id, 'return-tab-history');
  h.render({ ...props, initialTabId: 'token' });
  h.render({ ...props, initialTabId: 'token' });
  assert.equal(selected().props.id, 'return-tab-token');
});

test('navegação por teclado usa IDs únicos e foca a aba correspondente', () => {
  const h = tabsHarness({ id: 'keyboard', label: 'Tarefas', tabs: tabFixtures });
  let focused;
  const buttons = elements(h.tree).filter((e) => e.props?.role === 'tab');
  buttons.forEach((button) => button.props.ref({ focus: () => { focused = button.props.id; } }));
  buttons[0].props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
  h.render();
  assert.equal(focused, 'keyboard-tab-token');
  const active = elements(h.tree).find((e) => e.props?.role === 'tab' && e.props['aria-selected']);
  assert.equal(active.props['aria-controls'], 'keyboard-panel-token');
  active.props.onKeyDown({ key: 'Home', preventDefault() {} }); h.render();
  assert.equal(focused, 'keyboard-tab-history');
});

test('cadastro mantém ações, retorno por seção e restrição de usuários', () => {
  const createClient = () => {};
  const createUser = () => {};
  const { AdminCadastroCards } = sourceLoader({ ...uiMocks,
    '@/lib/admin': { createClientAction: createClient, createUserAction: createUser },
    '@/components/ui/action-tabs': { ActionTabs: 'task-tabs' },
    '@/components/admin-section-message': { AdminSectionMessage: 'message' },
    '@/components/create-node-form': { CreateNodeForm: 'node-form' },
    '@/components/role-scope-fields': { RoleScopeFields: 'scope-fields' },
    '@/components/agent-token-form': { AgentTokenForm: 'token-form' },
  })('components/admin-cadastro-cards.tsx');
  const props = { filterOptions: { clients: [], sites: [] }, nodes: { items: [] }, roles: [], activeSection: 'node' };
  for (const canManageUsers of [true, false]) {
    const tree = AdminCadastroCards({ ...props, canManageUsers });
    assert.equal(tree.props.initialTabId, 'node');
    assert.equal(tree.props.tabs.length, 4);
    const forms = tree.props.tabs.flatMap((tab) => elements(tab.content));
    assert.ok(forms.some((e) => e.type === 'form' && e.props.action === createClient));
    assert.equal(forms.some((e) => e.type === 'form' && e.props.action === createUser), canManageUsers);
    assert.ok(forms.some((e) => e.type === 'node-form'));
    assert.equal(tree.props.tabs.find((tab) => tab.id === 'agent-token').unmountOnHide, true);
  }
});

test('atualizações saem da identidade e preservam permissões e dados por operação', () => {
  const { NodeDetailOverviewTab } = sourceLoader({ ...uiMocks,
    '@/lib/admin': { setNodeMaintenanceAction: () => {} },
    '@/components/ui/action-tabs': { ActionTabs: 'task-tabs' },
    '@/components/node-package-upgrade-section': { NodePackageUpgradeSection: 'agent-update' },
    '@/components/node-pfsense-upgrade-section': { NodePfsenseUpgradeSection: 'os-update' },
    '@/components/nodes/node-certificates-panel': { NodeCertificatesPanel: 'certificates' },
    '@/components/nodes/node-capabilities-panel': { NodeCapabilitiesPanel: 'capabilities' },
    '@/components/nodes/node-pfsense-api-panel': { NodePfsenseApiPanel: 'aliases' },
  })('components/nodes/node-detail-overview-tab.tsx');
  const tree = NodeDetailOverviewTab({ node: { id: 'lab', client: { name: 'Test' }, site: { name: 'Test' } }, canManageNode: false, canRunUpgrade: false, canRunPackageUpgrade: true, upgradeStatus: { marker: 'os' }, packageUpgradeStatus: { marker: 'agent' } });
  const tabs = elements(tree).find((e) => e.type === 'task-tabs');
  assert.equal(tabs.props.tabs.length, 2);
  const [agent, os] = tabs.props.tabs.map((tab) => tab.content);
  assert.equal(agent.props.canRunPackageUpgrade, true);
  assert.equal(os.props.canRunUpgrade, false);
  assert.equal(os.props.initialStatus.marker, 'os');
  const identity = elements(tree).find((e) => e.props?.title === 'Visão geral');
  assert.ok(identity);
  assert.ok(!elements(identity).some((e) => e.type === 'agent-update' || e.type === 'os-update'));
});

test('backup separa histórico, comparação e retenção sem mudar permissões ou dados', () => {
  const h = hookHarness();
  const { NodeConfigBackupsSection } = sourceLoader({ ...uiMocks, react: h.react,
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/lib/backups': { pollConfigBackupCommandAction: () => assert.fail(), requestConfigBackupAction: () => assert.fail() },
    '@/components/ui/action-tabs': { ActionTabs: 'task-tabs' },
    '@/components/backup-download-button': { BackupDownloadButton: 'download' },
    '@/components/backups/backup-advanced-panel': { BackupDriftIndicator: 'drift', BackupRetentionPolicyForm: 'retention' },
    '@/components/backups/backup-diff-viewer': { BackupDiffViewer: 'diff' },
  })('components/node-config-backups-section.tsx');
  const backups = { items: [{ id: 'backup-id', status: 'stored', received_at: '2026-11-01T12:00:00Z', size_bytes: 1024, config_sha256: 'abc' }], visual_status: 'ok', summary: { stored_count: 1, total_stored_bytes: 1024 }, advanced_features: { diff_enabled: true } };
  const tree = h.render(NodeConfigBackupsSection, { nodeId: 'node', initialBackups: backups, canRequest: false, canDownload: false, canManage: false });
  const tabs = elements(tree).find((e) => e.type === 'task-tabs').props.tabs;
  assert.deepEqual(tabs.map((tab) => tab.id), ['history', 'compare', 'retention']);
  assert.ok(!elements(tabs[0].content).some((e) => e.type === 'download'));
  const compare = elements(tabs[1].content).find((e) => e.type === 'diff');
  assert.equal(compare.props.items, backups.items);
  assert.equal(compare.props.enabled, true);
  const policy = elements(tabs[2].content).find((e) => e.type === 'retention');
  assert.equal(policy.props.canManage, false);
  assert.equal(policy.props.backups, backups);
  assert.ok(elements(tree).some((e) => e.type === 'drift'));
});

test('técnicos separam consulta e gestão de acordo com o perfil', async () => {
  for (const manage of [false, true]) {
    const page = sourceLoader({ ...uiMocks,
      'next/navigation': { redirect() { assert.fail('Perfil deve acessar consulta'); } },
      '@/components/ui/action-tabs': { ActionTabs: 'task-tabs' },
      '@/components/admin-technician-targets': { AdminTechnicianTargets: 'targets' },
      '@/lib/api': {
        ApiError: class extends Error {},
        getSession: async () => ({ permissions: ['technicians.view', ...(manage ? ['technicians.manage'] : [])], has_global_client_scope: manage }),
        getTechnicians: async () => ({ items: [], batch_max_size: 20 }),
        getNodesList: async () => ({ items: [], total: 0 }),
        getTechnician: () => assert.fail(),
      },
    })('app/admin/tecnicos/page.tsx').default;
    const tree = await page();
    const tabs = elements(tree).find((e) => e.type === 'task-tabs').props.tabs;
    assert.equal(tabs.length, manage ? 2 : 1);
    assert.equal(tabs[0].id, 'accounts');
    if (manage) {
      const target = elements(tabs[1].content).find((e) => e.type === 'targets');
      assert.equal(target.props.canManageTechnicians, true);
      assert.equal(target.props.batchMaxSize, 20);
    }
  }
});
