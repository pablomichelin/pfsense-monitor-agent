import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, hookHarness, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

function fixture(permissions) {
  const reads = [];
  const list = (name, items = []) => async () => {
    reads.push(name);
    return { items };
  };
  const routes = sourceLoader({
    ...uiMocks,
    '@/components/notifications-admin-panel': { NotificationsAdminPanel: 'notifications-panel' },
    '@/components/fleet-org-admin-panel': { FleetOrgAdminPanel: 'fleet-panel' },
    '@/lib/handle-page-api-error': { handlePageApiError: (error) => { throw error; } },
    'next/navigation': { redirect: (url) => { throw Object.assign(new Error('Redirect'), { url }); } },
    '@/lib/api': {
      getSession: async () => ({ permissions }),
      getNodesFilters: async () => {
        reads.push('inventory');
        if (!permissions.includes('firewalls.view')) throw new Error('QA inventory 403');
        return { clients: [{ id: 'active', name: 'QA active', status: 'active' }] };
      },
      listFleetTags: list('tags', [{ id: 'tag-1' }]),
      listFleetGroups: list('groups', [{ id: 'group-1' }]),
      getFleetGroup: async () => { throw new Error('Group members must not be loaded for this profile'); },
    },
    '@/lib/notifications': {
      getNotificationsStatus: async () => ({ enabled: false }),
      listNotificationChannels: list('channels', [{ id: 'channel-1' }]),
      listNotificationRules: list('rules', [{ id: 'rule-1' }]),
      listNotificationDeliveries: list('deliveries'),
    },
  });
  return { routes, reads };
}

test('notification readers can see their settings without inventory access', async () => {
  const { routes, reads } = fixture(['notifications.view']);
  const tree = await routes('app/admin/notificacoes/page.tsx').default();
  const panel = elements(tree).find((item) => item.type === 'notifications-panel');
  assert.deepEqual(panel.props.rules, [{ id: 'rule-1' }]);
  assert.deepEqual(panel.props.clients, []);
  assert.equal(panel.props.canManage, false);
  assert.deepEqual(reads, ['channels', 'rules', 'deliveries']);
});

test('fleet organization renders the visible groups without inventory access', async () => {
  const { routes, reads } = fixture(['groups.view', 'groups.manage']);
  const tree = await routes('app/admin/grupos/page.tsx').default();
  const panel = elements(tree).find((item) => item.type === 'fleet-panel');
  assert.deepEqual(panel.props.groups, [{ id: 'group-1' }]);
  assert.deepEqual(panel.props.clients, []);
  assert.equal(panel.props.canManageGroups, true);
  assert.equal(panel.props.canEditGroupMembers, false);
  assert.deepEqual(reads, ['groups']);
});

test('notification editor keeps a rule client that is outside the selectable list', () => {
  const harness = hookHarness();
  const { NotificationsAdminPanel } = sourceLoader({
    ...uiMocks, react: harness.react,
    '@/components/confirm-dialog': { ConfirmDialog: 'confirm' },
    '@/lib/notifications-actions': {},
  })('components/notifications-admin-panel.tsx');
  const props = {
    status: { enabled: false }, channels: [], deliveries: [],
    rules: [{ id: 'qa-rule', name: 'QA rule', client_id: 'qa-archived', client_name: 'QA archived client' }],
    clients: [{ id: 'qa-active', name: 'QA active', code: 'qa' }],
    canManage: true, canTest: false,
  };
  const tree = harness.render(NotificationsAdminPanel, props);
  elements(tree).find((item) => item.type === 'button' && textOf(item) === 'Editar').props.onClick();
  const editTree = harness.render(NotificationsAdminPanel, props);
  const fields = elements(editTree).find((item) => typeof item.type === 'function'
    && item.props.rule?.id === 'qa-rule');
  const select = elements(fields.type(fields.props)).find((item) => item.props?.name === 'client_id');
  assert.equal(select.props.defaultValue, 'qa-archived');
  const options = elements(select).filter((item) => item.type === 'option');
  assert.deepEqual(options.map((item) => item.props.value), ['', 'qa-archived', 'qa-active']);
  assert.match(textOf(options[1]), /QA archived client/);
});
