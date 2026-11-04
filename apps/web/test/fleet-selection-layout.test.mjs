import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, hookHarness, elements, textOf } from './source-harness.mjs';

function fixture(permissions = {}) {
  const harness = hookHarness();
  const { FleetInventorySection } = sourceLoader({
    ...uiMocks, react: harness.react,
    '@/components/confirm-dialog': { ConfirmDialog: 'confirm-dialog' },
    '@/components/nodes/fleet-batch-backup-panel': { FleetBatchBackupPanel: 'backup-form' },
    '@/components/nodes/fleet-batch-package-upgrade-panel': { FleetBatchPackageUpgradePanel: 'upgrade-form' },
    '@/components/nodes/fleet-technician-management-panel': { FleetTechnicianManagementPanel: 'technician-form' },
    '@/components/nodes/fleet-pf-tables-panel': { FleetPfTablesPanel: 'unblock-form' },
    '@/components/nodes/nodes-inventory-table': { NodesInventoryTable: 'inventory' },
    '@/lib/admin': { deleteNodesBatchAction: () => assert.fail('Sem ação remota neste teste') },
  })('components/nodes/fleet-inventory-section.tsx');
  const props = {
    nodes: [{ id: 'one', hostname: 'synthetic', display_name: 'Firewall de teste', agent_version: '0.5.34' }],
    canRequestBackupBatch: true, canRunPackageUpgrade: true, canManagePfTables: true,
    canManageTechnicians: true, canResetTechnicianPassword: true, canDeleteHosts: true,
    ...permissions,
  };
  const render = () => harness.render(FleetInventorySection, props);
  const initial = render();
  elements(initial).find((e) => e.type === 'inventory').props.selection.onToggle('one');
  return { render, harness };
}

test('ações da seleção mostram uma aba por vez e mantêm todos os formulários montados', () => {
  const { render } = fixture();
  let tree = render();
  const tabs = () => elements(tree).filter((e) => e.props?.role === 'tab');
  const panels = () => elements(tree).filter((e) => e.props?.role === 'tabpanel');
  assert.deepEqual(tabs().map(textOf).map((s) => s.trim().split(' ')[0]), ['Desbloquear', 'Atualizar', 'Backups', 'Técnicos']);
  assert.equal(panels().length, 4);
  assert.equal(panels().filter((e) => !e.props.hidden).length, 1);
  assert.equal(panels().find((e) => !e.props.hidden).props.id, 'fleet-action-panel-unblock');
  tabs().find((e) => e.props.id.endsWith('-backup')).props.onClick();
  tree = render();
  assert.equal(panels().filter((e) => !e.props.hidden).length, 1);
  assert.equal(panels().find((e) => !e.props.hidden).props.id, 'fleet-action-panel-backup');
  assert.equal(elements(tree).filter((e) => e.type === 'unblock-form').length, 1);
  assert.deepEqual(elements(tree).find((e) => e.type === 'backup-form' && e.props.mode === 'selection').props.nodeIds, ['one']);
  assert.ok(textOf(tree).includes('Firewall de teste'));
});

test('abas seguem permissões e seleção continua separada do backup da página', () => {
  const { render } = fixture({ canManagePfTables: false, canRunPackageUpgrade: false, canManageTechnicians: false, canResetTechnicianPassword: false, canDeleteHosts: false });
  let tree = render();
  const tab = elements(tree).find((e) => e.props?.role === 'tab');
  assert.equal(tab.props.id, 'fleet-action-tab-backup');
  assert.equal(tab.props['aria-selected'], true);
  assert.ok(!elements(tree).some((e) => e.type === 'technician-form' || e.type === 'upgrade-form' || e.type === 'unblock-form'));
  elements(tree).find((e) => e.type === 'button' && textOf(e).includes('Backup da página atual')).props.onClick();
  tree = render();
  assert.deepEqual(elements(tree).filter((e) => e.type === 'backup-form').map((e) => e.props.mode).sort(), ['filter', 'selection']);
  elements(tree).find((e) => e.type === 'button' && textOf(e) === 'Limpar seleção').props.onClick();
  tree = render();
  assert.ok(!elements(tree).some((e) => e.props?.role === 'tab'));
  assert.equal(elements(tree).find((e) => e.type === 'inventory').props.selection.selectedIds.size, 0);
});

test('setas e Home/End selecionam e focam abas acessíveis', () => {
  const { render } = fixture();
  let tree = render();
  let focused = '';
  const tabs = elements(tree).filter((e) => e.props?.role === 'tab');
  for (const tab of tabs) tab.props.ref({ focus: () => { focused = tab.props.id; } });
  tabs[0].props.onKeyDown({ key: 'End', preventDefault() {} });
  tree = render();
  assert.equal(focused, 'fleet-action-tab-technicians');
  const active = elements(tree).find((e) => e.props?.role === 'tab' && e.props['aria-selected']);
  assert.equal(active.props.tabIndex, 0);
  active.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
  tree = render();
  assert.equal(elements(tree).find((e) => e.props?.role === 'tab' && e.props['aria-selected']).props.id, 'fleet-action-tab-unblock');
});


test('painel lateral pode recolher sem desmontar formulários nem perder seleção', () => {
  const { render } = fixture();
  let tree = render();
  assert.ok(!elements(tree).find(e => e.props?.id === 'fleet-action-workspace').props.hidden);
  elements(tree).find(e => e.type === 'button' && textOf(e) === 'Recolher ações').props.onClick();
  tree = render();
  assert.ok(elements(tree).find(e => e.props?.id === 'fleet-action-workspace').props.hidden);
  assert.ok(elements(tree).some(e => e.type === 'unblock-form'));
  assert.equal(elements(tree).find(e => e.type === 'inventory').props.selection.selectedIds.size, 1);
  elements(tree).find(e => e.type === 'button' && textOf(e) === 'Abrir ações').props.onClick();
  tree = render();
  assert.ok(!elements(tree).find(e => e.props?.id === 'fleet-action-workspace').props.hidden);
});
