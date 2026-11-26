import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, hookHarness, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

const clients = [
  { id: 'client-a', name: 'Cliente A', node_count: 11 },
  { id: 'client-b', name: 'Cliente B', node_count: 14 },
];
const sites = [
  { id: 'site-a', client_id: 'client-a', client_name: 'Cliente A', name: 'Local A', node_count: 11 },
  { id: 'site-b', client_id: 'client-b', client_name: 'Cliente B', name: 'Local B', node_count: 14 },
];

test('trocar o cliente limpa o local antigo e permite escolher um do novo cliente', () => {
  const hooks = hookHarness();
  const { BackupScopeSelects } = sourceLoader({ react: hooks.react })('components/backups/backup-scope-selects.tsx');
  const props = { clients, sites, initialClientId: 'client-a', initialSiteId: 'site-a' };
  const select = (name) => elements(hooks.render(BackupScopeSelects, props)).find((entry) => entry.props.name === name);
  const optionValues = () => elements(select('site_id')).filter((entry) => entry.type === 'option').map((entry) => entry.props.value);

  assert.deepEqual(optionValues(), ['', 'site-a']);
  select('client_id').props.onChange({ currentTarget: { value: 'client-b' } });
  assert.deepEqual(optionValues(), ['', 'site-b']);
  assert.equal(select('site_id').props.value, '');
  select('site_id').props.onChange({ currentTarget: { value: 'site-b' } });
  select('client_id').props.onChange({ currentTarget: { value: '' } });
  assert.equal(select('site_id').props.value, 'site-b');
  assert.deepEqual(optionValues(), ['', 'site-a', 'site-b']);
});

test('URL antiga com cliente e local incompatíveis informa a causa e corrige os atalhos', async () => {
  const requests = [];
  let permissions = ['firewalls.view', 'backups.view'];
  const { default: BackupsPage } = sourceLoader({
    ...uiMocks,
    '@/components/backups/backup-scope-selects': { BackupScopeSelects: 'scope-selects' },
    '@/components/backups/backups-fleet-table': { BackupsFleetTable: 'backups-table' },
    '@/lib/handle-page-api-error': { handlePageApiError: (error) => { throw error; } },
    '@/lib/api': {
      getBackupFilters: async () => ({ clients, sites }),
      getSession: async () => ({ user: { role: 'admin' }, permissions }),
      getBackupFleetList: async (query) => {
        requests.push(query);
        return { total: 0, total_pages: 1, page: 1, items: [], summary: { ok: 0, late: 0, failed: 0, never: 0 }, generated_at: '2026-11-25T21:00:00Z' };
      },
    },
  })('app/backups/page.tsx');

  const render = (siteId, overrides = {}) => BackupsPage({
    searchParams: Promise.resolve({
      client_id: 'client-b', site_id: siteId, page: '2', per_page: '10',
      sort_by: 'name', sort_order: 'desc', search: 'Sede', backup_status: 'late', ...overrides,
    }),
  });
  const tree = await render('site-a');
  assert.equal(requests[0].site_id, 'site-a', 'the initial results continue to represent the bookmarked query');
  assert.match(textOf(tree), /O local da consulta pertence a outro cliente/);
  const hero = elements(tree).find((entry) => entry.type === 'hero');
  assert.equal(hero.props.aside.props.realtimeEnabled, true);
  const failed = new URL(hero.props.stats.find((stat) => stat.label === 'Falharam').href, 'http://example.test');
  assert.deepEqual(Object.fromEntries(failed.searchParams), {
    client_id: 'client-b', search: 'Sede', backup_status: 'failed',
    sort_by: 'name', sort_order: 'desc', per_page: '10',
  });
  assert.equal(elements(tree).find((entry) => entry.type === 'scope-selects').props.initialSiteId, undefined);

  permissions = ['backups.view'];
  const hiddenSite = await render('site-inactive');
  const hiddenPicker = elements(hiddenSite).find((entry) => entry.type === 'scope-selects');
  assert.equal(hiddenPicker.props.initialSiteId, 'site-inactive');
  assert.equal(requests[1].site_id, 'site-inactive');
  assert.equal(elements(hiddenSite).find((entry) => entry.type === 'hero').props.aside.props.realtimeEnabled, false);

  const formKey = (page) => elements(page).find((entry) => entry.type === 'form').key;
  const nextStatus = await render('site-inactive', { backup_status: 'failed' });
  const nextPage = await render('site-inactive', { page: '3' });
  assert.notEqual(formKey(nextStatus), formKey(hiddenSite));
  assert.equal(formKey(nextPage), formKey(hiddenSite));
});
