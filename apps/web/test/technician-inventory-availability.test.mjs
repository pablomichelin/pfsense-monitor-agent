import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

class ApiError extends Error {
  constructor(status) {
    super('Synthetic API failure');
    this.status = status;
  }
}

function fixture(permissions, detailFailure, { expanded = false, inventoryFailure } = {}) {
  const reads = [];
  const listRequests = [];
  const detailRequests = [];
  const node = { id: 'qa-firewall' };
  const technician = {
    id: 'qa-tech', full_name: 'Técnico sintético', login_username: 'qa-tech', status: 'active',
    node_accounts: [{ id: 'qa-account', node_id: node.id, hostname: 'qa.example.test', status: 'active' }],
  };
  const otherTechnician = { ...technician, id: 'qa-other', full_name: 'Segunda técnica sintética' };
  const route = sourceLoader({
    ...uiMocks,
    '@/components/ui/action-tabs': { ActionTabs: 'action-tabs' },
    '@/components/admin-technician-targets': { AdminTechnicianTargets: 'targets' },
    'next/navigation': { redirect: (url) => { throw Object.assign(new Error('Redirect'), { url }); } },
    '@/lib/api': {
      ApiError,
      getSession: async () => ({ permissions, has_global_client_scope: true }),
      getTechnicians: async (...args) => {
        listRequests.push(args);
        const items = expanded
          ? [technician, { ...otherTechnician, node_accounts: [] }]
          : (detailFailure ? [technician, otherTechnician] : [technician]).map(
            ({ node_accounts, ...summary }) => summary,
          );
        return { items, batch_max_size: 100 };
      },
      getTechnician: async (id) => {
        detailRequests.push(id);
        if (id === otherTechnician.id && detailFailure) throw new ApiError(detailFailure);
        return { technician };
      },
      getNodesList: async (query) => {
        reads.push(query);
        if (!permissions.includes('firewalls.view')) throw new ApiError(403);
        if (inventoryFailure) throw new ApiError(inventoryFailure);
        return { items: [node], total: 123 };
      },
    },
  })('app/admin/tecnicos/page.tsx').default;
  return { route, reads, node, listRequests, detailRequests };
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

test('one failed technician detail keeps the other accounts and discloses partial coverage', async () => {
  const { route } = fixture(['technicians.view'], 503);
  const tree = await route();
  const tabs = elements(tree).find((item) => item.type === 'action-tabs').props.tabs;
  const matrix = textOf(tabs[0].content);
  assert.match(matrix, /Técnico sintético.*qa\.example\.test/);
  assert.match(matrix, /Segunda técnica sintética.*Contas indisponíveis/);
  const totals = elements(tree).find((item) => item.type === 'hero').props.stats;
  assert.deepEqual(totals.map((item) => item.value), ['2', '1 confirmada(s)']);
});

test('detail read still redirects on session expiry', async () => {
  const { route } = fixture(['technicians.view'], 401);
  await assert.rejects(route, { url: '/login' });
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

test('the technician matrix uses one expanded list and keeps an empty account list intact', async () => {
  const { route, listRequests, detailRequests } = fixture(['technicians.view'], undefined, { expanded: true });
  const tree = await route();
  const tabs = elements(tree).find((item) => item.type === 'action-tabs').props.tabs;
  assert.match(textOf(tabs[0].content), /Segunda técnica sintética.*Sem contas visíveis/);
  assert.deepEqual(listRequests, [['active', { includeAccounts: true }]]);
  assert.deepEqual(detailRequests, []);
});


test('an inventory outage preserves the technician matrix with no batch actions', async () => {
  const permissions = ['technicians.view', 'technicians.manage', 'firewalls.view'];
  const { route } = fixture(permissions, undefined, { inventoryFailure: 503 });
  const tree = await route();
  assert.match(textOf(tree), /Não foi possível consultar o inventário/);
  const tabs = elements(tree).find((item) => item.type === 'action-tabs').props.tabs;
  assert.deepEqual(tabs.map((tab) => tab.id), ['accounts']);
  assert.match(textOf(tabs[0].content), /Técnico sintético/);
  const expired = fixture(permissions, undefined, { inventoryFailure: 401 });
  await assert.rejects(expired.route, { url: '/login' });
});
