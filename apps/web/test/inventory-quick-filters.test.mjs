import test from 'node:test';
import assert from 'node:assert/strict';
import { elements, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

test('atalhos do inventário preservam filtros e ordenação ao voltar à primeira página', async () => {
  const queries = [];
  const { default: page } = sourceLoader({
    ...uiMocks,
    '@/components/nodes/fleet-inventory-section': { FleetInventorySection: 'fleet' },
    '@/lib/api': {
      getNodesList: async (query) => {
        queries.push(query);
        return { items: [], total: 0, limit: 50, generated_at: '2026-11-24T00:00:00Z' };
      },
      getNodesFilters: async () => ({ clients: [], sites: [], tags: [], groups: [] }),
      getSession: async () => ({ user: { role: 'readonly' }, permissions: [] }),
      getPackageRelease: async () => ({ version: '0.5.35' }),
    },
  })('app/nodes/page.tsx');
  const filters = {
    client_id: 'synthetic-client',
    site_id: 'synthetic-site',
    tag_id: 'synthetic-tag',
    group_id: 'synthetic-group',
    criticality: 'standard',
    search: 'VPN & LAN',
  };
  const sort = { sort_by: 'backup', sort_order: 'desc' };
  const render = (query) => page({ searchParams: Promise.resolve(query) });
  const shortcut = (tree, label) => {
    const shortcuts = elements(tree).find((element) => element.props?.['aria-label'] === 'Atalhos de inventário');
    return elements(shortcuts).find((element) => element.type === 'a' && textOf(element) === label).props.href;
  };

  const filtered = await render({
    ...filters, ...sort, cursor: 'synthetic-cursor', preset: 'problem', status: 'offline',
  });
  assert.equal(queries.at(-1).cursor, 'synthetic-cursor');
  assert.equal(queries.at(-1).sort_by, 'backup');
  assert.equal(queries.at(-1).sort_order, 'desc');

  for (const [label, preset] of [['Degradados', 'degraded'], ['Todos', undefined]]) {
    const url = new URL(shortcut(filtered, label), 'https://synthetic.invalid');
    assert.equal(url.pathname, '/nodes');
    const nextFilters = Object.fromEntries(url.searchParams);
    assert.deepEqual(nextFilters, { ...filters, ...sort, ...(preset ? { preset } : {}) });

    await render(nextFilters);
    assert.deepEqual(queries.at(-1), {
      ...filters, ...sort, preset, limit: 50, cursor: undefined, status: undefined,
    });
  }
  assert.equal(shortcut(await render({}), 'Todos'), '/nodes');
});
