import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

class ApiError extends Error {
  constructor(status) {
    super('Synthetic upgrade status error');
    this.status = status;
  }
}

const node = {
  id: 'qa', hostname: 'firewall.example.test', node_uid: 'qa',
  client: { id: 'client', name: 'QA' }, site: { name: 'Local' },
  effective_status: 'online', last_seen_at: null,
};
const slots = {
  'nodes/node-command-history-panel': { NodeCommandHistoryPanel: 'history' },
  'nodes/node-operational-actions-section': { NodeOperationalActionsSection: 'operations' },
  'nodes/node-detail-alerts-tab': { NodeDetailAlertsTab: 'alerts' },
  'nodes/node-detail-backup-tab': { NodeDetailBackupTab: 'backup' },
  'nodes/node-detail-config-tab': { NodeDetailConfigTab: 'config' },
  'nodes/node-detail-metrics-tab': { NodeDetailMetricsTab: 'metrics' },
  'nodes/node-detail-overview-tab': { NodeDetailOverviewTab: 'overview', NodeUpdatesSection: 'updates' },
  'nodes/node-detail-tabs': { NodeDetailTabs: 'detail-tabs' },
  'nodes/node-technician-accounts-panel': { NodeTechnicianAccountsPanel: 'access' },
  'delete-node-button': { DeleteNodeButton: 'delete-button' },
};

function renderDetail(failingEndpoint, status) {
  const { default: NodeDetailsPage } = sourceLoader({
    ...uiMocks,
    ...Object.fromEntries(Object.entries(slots).map(([file, mocks]) => ['@/components/' + file, mocks])),
    'next/navigation': {
      redirect: (url) => { throw Object.assign(new Error('Redirect'), { url }); },
      notFound: () => assert.fail('unexpected 404'),
    },
    '@/lib/api': {
      ApiError,
      getNodeDetails: async () => ({ node }),
      getSession: async () => ({ user: { role: 'readonly' }, permissions: [] }),
      getPfsenseUpgradeStatus: async () => {
        if (failingEndpoint === 'os') throw new ApiError(status);
        return { enabled: true, marker: 'os' };
      },
      getPackageUpgradeStatus: async () => {
        if (failingEndpoint === 'agent') throw new ApiError(status);
        return { enabled: true, marker: 'agent' };
      },
      getNodeMetricsHistory: async () => ({ enabled: false, points: [] }),
      getNodeCommandHistory: async () => ({ items: [] }),
      getOperationalActionsStatus: async () => ({ enabled: false }),
    },
  })('app/nodes/[id]/page.tsx');
  return NodeDetailsPage({ params: Promise.resolve({ id: node.id }) });
}

test('falha de uma consulta de atualização preserva detalhe, histórico e consulta irmã', async () => {
  for (const [endpoint, title] of [
    ['agent', 'Atualização do agente Monitor'], ['os', 'Atualização do pfSense OS'],
  ]) {
    const tree = await renderDetail(endpoint, 503);
    assert.ok(textOf(tree).includes('Não foi possível carregar'));
    assert.ok(textOf(tree).includes(title));
    const tabs = elements(tree).find((item) => item.type === 'detail-tabs');
    assert.ok(elements(tabs.props.overview).some((item) => item.type === 'overview'));
    assert.ok(elements(tabs.props.history).some((item) => item.type === 'history'));
    const updates = elements(tabs.props.operations).find((item) => item.type === 'updates');
    assert.equal(updates.props.packageUpgradeStatus?.marker ?? null, endpoint === 'agent' ? null : 'agent');
    assert.equal(updates.props.upgradeStatus?.marker ?? null, endpoint === 'os' ? null : 'os');
  }
});

test('falhas de sessão e escopo da consulta mantêm os redirecionamentos vigentes', async () => {
  await assert.rejects(() => renderDetail('agent', 401), { url: '/login' });
  await assert.rejects(() => renderDetail('os', 403), { url: '/conta?access=denied' });
});
