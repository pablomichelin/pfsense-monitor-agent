import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, hookHarness, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

class ApiError extends Error {
  constructor(status) {
    super('QA error');
    this.status = status;
  }
}

function fixture(permissions, { groups = [{ id: 'group-1' }], groupDetailFailure } = {}) {
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
      ApiError,
      getSession: async () => ({ permissions }),
      getNodesFilters: async () => {
        reads.push('inventory');
        if (!permissions.includes('firewalls.view')) throw new Error('QA inventory 403');
        return { clients: [{ id: 'active', name: 'QA active', status: 'active' }] };
      },
      getActiveAdminClientOptions: async () => {
        reads.push('clients');
        assert.ok(permissions.includes('clients.view'));
        return [{ id: 'qa-client', name: 'QA client', code: 'qa-client' }];
      },
      listFleetTags: list('tags', [{ id: 'tag-1' }]),
      listFleetGroups: list('groups', groups),
      getFleetGroup: async (id) => {
        reads.push(`group:${id}`);
        if (groupDetailFailure) throw new ApiError(groupDetailFailure);
        return { group: { id }, members: [{ node_id: `node-for-${id}` }] };
      },
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
  const tree = await routes('app/admin/grupos/page.tsx').default({});
  const panel = elements(tree).find((item) => item.type === 'fleet-panel');
  assert.deepEqual(panel.props.groups, [{ id: 'group-1' }]);
  assert.deepEqual(panel.props.clients, []);
  assert.equal(panel.props.canManageGroups, true);
  assert.equal(panel.props.canEditGroupMembers, false);
  assert.deepEqual(reads, ['groups']);
});

test('authorized client readers can use management selectors without loading inventory', async () => {
  const expected = { id: 'qa-client', name: 'QA client', code: 'qa-client' };
  const organization = fixture(['groups.view', 'groups.manage', 'clients.view']);
  const groups = await organization.routes('app/admin/grupos/page.tsx').default({});
  const fleetPanel = elements(groups).find((item) => item.type === 'fleet-panel');
  assert.deepEqual(fleetPanel.props.clients, [{ id: expected.id, name: expected.name }]);
  assert.equal(fleetPanel.props.canEditGroupMembers, false);
  assert.deepEqual(organization.reads, ['groups', 'clients']);

  const notifications = fixture(['notifications.view', 'notifications.manage', 'clients.view']);
  const rules = await notifications.routes('app/admin/notificacoes/page.tsx').default();
  const notificationPanel = elements(rules).find((item) => item.type === 'notifications-panel');
  assert.deepEqual(notificationPanel.props.clients, [expected]);
  assert.deepEqual(notifications.reads, ['channels', 'rules', 'deliveries', 'clients']);
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


test('group administration loads members only for the selected group', async () => {
  const permissions = ['groups.view', 'groups.manage', 'firewalls.view'];
  const groups = [{ id: 'group-1' }, { id: 'group-2' }, { id: 'group-3' }];
  for (const selected of [undefined, 'group-2']) {
    const { routes, reads } = fixture(permissions, { groups });
    const tree = await routes('app/admin/grupos/page.tsx').default({
      searchParams: Promise.resolve({ group: selected }),
    });
    const active = selected ?? 'group-1';
    assert.deepEqual(reads, ['groups', 'inventory', `group:${active}`]);
    const panel = elements(tree).find((element) => element.type === 'fleet-panel');
    assert.equal(panel.props.selectedGroupId, active);
    assert.deepEqual(panel.props.groupMemberIds, [`node-for-${active}`]);
  }
});

test('one unavailable group detail keeps the list and does not present empty membership', async () => {
  const permissions = ['groups.view', 'groups.manage', 'firewalls.view'];
  const { routes, reads } = fixture(permissions, { groupDetailFailure: 503 });
  const tree = await routes('app/admin/grupos/page.tsx').default({});
  assert.deepEqual(reads, ['groups', 'inventory', 'group:group-1']);
  const panel = elements(tree).find((element) => element.type === 'fleet-panel');
  assert.deepEqual(panel.props.groups, [{ id: 'group-1' }]);
  assert.equal(panel.props.selectedGroupId, 'group-1');
  assert.equal(panel.props.groupMemberIds, null);
});
