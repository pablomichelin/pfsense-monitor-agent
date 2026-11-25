import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

class ApiError extends Error {
  constructor(status) {
    super('Synthetic API error');
    this.status = status;
  }
}

function makePage(permissions, inventoryStatus = 200) {
  let inventoryReads = 0;
  const alertQueries = [];
  const { default: AlertsPage } = sourceLoader({
    ...uiMocks,
    'next/navigation': { redirect: (url) => { throw Object.assign(new Error('Redirect'), { url }); } },
    '@/lib/alerts': { acknowledgeAlertAction: () => {}, resolveAlertAction: () => {} },
    '@/lib/api': {
      ApiError,
      getSession: async () => ({ permissions }),
      getNodesFilters: async () => {
        inventoryReads++;
        if (inventoryStatus !== 200) throw new ApiError(inventoryStatus);
        return { clients: [{ id: 'qa-client', name: 'QA' }], sites: [] };
      },
      getAlertsList: async (query) => {
        alertQueries.push(query);
        return {
          total: 1, page: 1, total_pages: 1, generated_at: '2026-11-25T21:00:00Z',
          totals: { open: 1, acknowledged: 0, resolved: 0, critical_pending: 0, critical_resolved: 0 },
          items: [{
            id: 'qa-alert', status: 'open', severity: 'warning', type: 'service_down',
            title: 'Alerta sintético', opened_at: '2026-11-25T20:00:00Z',
            node: { id: 'qa-node', hostname: 'qa-node.example.test' }, client: { name: 'QA' }, site: { name: 'Local' },
          }],
        };
      },
    },
  })('app/alerts/page.tsx');
  return {
    readCount: () => inventoryReads, alertQueries,
    render: () => AlertsPage({ searchParams: Promise.resolve({ client_id: 'qa-client', site_id: 'qa-site' }) }),
  };
}

test('alerts-only reader can open the list without requiring the inventory endpoint', async () => {
  const { render, readCount, alertQueries } = makePage(['alerts.view'], 403);
  const tree = await render();
  assert.match(textOf(tree), /Alerta sintético/);
  assert.equal(readCount(), 0);
  assert.equal(alertQueries[0].client_id, 'qa-client');
  assert.equal(alertQueries[0].site_id, 'qa-site');
  assert.equal(elements(tree).find((item) => item.type === 'hero').props.aside.props.realtimeEnabled, false);
  const inputs = elements(tree).filter((item) => item.type === 'input' && item.props.type === 'hidden');
  assert.ok(inputs.some((input) => input.props.name === 'site_id' && input.props.value === 'qa-site'));
  assert.ok(inputs.some((input) => input.props.name === 'client_id' && input.props.value === 'qa-client'));
  assert.ok(!elements(tree).some((item) => item.type === 'a' && item.props.href === '/nodes/qa-node'));
});

test('inventory access keeps scope selectors and firewall links', async () => {
  const { render, readCount } = makePage(['alerts.view', 'firewalls.view']);
  const tree = await render();
  assert.equal(readCount(), 1);
  assert.equal(elements(tree).find((item) => item.type === 'hero').props.aside.props.realtimeEnabled, true);
  assert.ok(elements(tree).some((item) => item.type === 'select' && item.props.name === 'client_id'));
  assert.ok(elements(tree).some((item) => item.type === 'a' && item.props.href === '/nodes/qa-node'));
});
