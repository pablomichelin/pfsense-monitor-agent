import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

class ApiError extends Error {
  constructor(status) {
    super('Synthetic API failure');
    this.status = status;
  }
}

function fixture(permissions) {
  const reads = [];
  const node = { id: 'qa-firewall' };
  const technician = {
    id: 'qa-tech', full_name: 'Técnico sintético', login_username: 'qa-tech', status: 'active',
    node_accounts: [{ id: 'qa-account', node_id: node.id, hostname: 'qa.example.test', status: 'active' }],
  };
  const route = sourceLoader({
    ...uiMocks,
    '@/components/ui/action-tabs': { ActionTabs: 'action-tabs' },
    '@/components/admin-technician-targets': { AdminTechnicianTargets: 'targets' },
    '@/lib/api': {
      ApiError,
      getSession: async () => ({ permissions, has_global_client_scope: true }),
      getTechnicians: async () => ({ items: [technician], batch_max_size: 100 }),
      getTechnician: async () => ({ technician }),
      getNodesList: async (query) => {
        reads.push(query);
        if (!permissions.includes('firewalls.view')) throw new ApiError(403);
        return { items: [node], total: 123 };
      },
    },
  })('app/admin/tecnicos/page.tsx').default;
  return { route, reads, node };
}

test('the technician matrix opens for readers without inventory access', async () => {
  const { route, reads } = fixture(['technicians.view']);
  const tree = await route();
  assert.deepEqual(reads, []);
  const tabs = elements(tree).find((item) => item.type === 'action-tabs').props.tabs;
  assert.deepEqual(tabs.map((tab) => tab.id), ['accounts']);
  assert.match(textOf(tabs[0].content), /Técnico sintético.*qa\.example\.test/);
  assert.ok(!elements(tabs[0].content).some((item) => item.type === 'a' && item.props.href === '/nodes/qa-firewall'));
});

test('the management tab preserves inventory pagination and API batch limit', async () => {
  const { route, reads, node } = fixture(['technicians.view', 'technicians.manage', 'firewalls.view']);
  const tree = await route();
  const tabs = elements(tree).find((item) => item.type === 'action-tabs').props.tabs;
  const targets = elements(tabs.find((tab) => tab.id === 'manage').content).find((item) => item.type === 'targets');
  assert.deepEqual(reads, [{ limit: 50 }]);
  assert.deepEqual(targets.props.initialPage, { items: [node], total: 123 });
  assert.equal(targets.props.batchMaxSize, 100);
  assert.equal(targets.props.canManageRegistry, true);
});
