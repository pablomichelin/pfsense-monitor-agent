import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, hookHarness, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

const group = { id: 'qa-group', name: 'QA group', client_id: 'qa-client', client_name: 'QA', member_count: 0 };

function fixture(actions) {
  const panel = hookHarness();
  const dialog = hookHarness();
  let current = panel;
  let refreshes = 0;
  const { FleetOrgAdminPanel } = sourceLoader({
    ...uiMocks,
    react: { useState: (...args) => current.react.useState(...args) },
    'next/navigation': { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    '@/components/confirm-dialog': { ConfirmDialog: 'dialog' },
    './group-member-picker': { GroupMemberPicker: 'member-picker' },
    '@/lib/fleet-org-actions': actions,
  })('components/fleet-org-admin-panel.tsx');
  const props = {
    tags: [], groups: [group], clients: [{ id: 'qa-client', name: 'QA' }],
    canManageTags: true, canManageGroups: true, canEditGroupMembers: false,
    groupMemberIds: null,
  };
  return {
    panel: () => {
      current = panel;
      return panel.render(FleetOrgAdminPanel, props);
    },
    dialog: (component) => {
      current = dialog;
      const tree = dialog.render(component.type, component.props);
      return {
        open: elements(tree).find((item) => item.type === 'button'),
        confirm: elements(tree).find((item) => item.type === 'dialog').props,
      };
    },
    refreshes: () => refreshes,
  };
}

test('create transport failure clears pending state and can be retried', async () => {
  let calls = 0;
  const qa = fixture({
    createTagAction: async () => {
      if (++calls === 1) throw new Error('QA transport unavailable');
      return { ok: true };
    },
  });
  const getForm = (tree) => elements(tree).find((item) => item.type === 'form'
    && elements(item).some(({ props }) => props.placeholder === 'Nome da tag'));
  await getForm(qa.panel()).props.action(new FormData());
  const afterFailure = qa.panel();
  assert.match(textOf(afterFailure), /Tente novamente/);
  assert.equal(elements(getForm(afterFailure)).find((item) => item.type === 'button').props.disabled, false);
  assert.equal(qa.refreshes(), 0);
  await getForm(afterFailure).props.action(new FormData());
  assert.match(textOf(qa.panel()), /Tag criada/);
  assert.equal(qa.refreshes(), 1);
});

test('deletion shows the API error and recovers after a transport interruption', async () => {
  let calls = 0;
  const qa = fixture({
    deleteGroupAction: async (id) => {
      assert.equal(id, group.id);
      calls++;
      if (calls === 1) return { ok: false, error: 'QA group is in use' };
      if (calls === 2) throw new Error('QA transport unavailable');
      return { ok: true };
    },
  });
  const button = elements(qa.panel()).find((item) =>
    typeof item.type === 'function' && (item.props.group?.id ?? item.props.item?.id) === group.id);
  qa.dialog(button).open.props.onClick();
  await qa.dialog(button).confirm.onConfirm();
  const failure = qa.dialog(button).confirm;
  assert.equal(failure.loading, false);
  assert.equal(failure.open, true);
  assert.match(textOf(failure.description), /QA group is in use/);
  await failure.onConfirm();
  const interrupted = qa.dialog(button).confirm;
  assert.equal(interrupted.loading, false);
  assert.equal(interrupted.open, true);
  assert.match(textOf(interrupted.description), /Tente novamente/);
  await interrupted.onConfirm();
  assert.equal(qa.dialog(button).confirm.open, false);
  assert.equal(qa.refreshes(), 1);
});
