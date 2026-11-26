import test from 'node:test';
import assert from 'node:assert/strict';
import { deferred, elements, hookHarness, settle, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

const nodeId = 'firmware-synthetic';
const requestedAt = '2026-11-25T19:01:00Z';
const initialStatus = {
  enabled: true,
  hostname: 'qa-firmware',
  pfsense_version: '2.8.0',
  agent_version_supported: true,
  update_available: true,
  target_version: '2.8.1',
  update_checked_at: '2026-11-25T19:00:00Z',
  refresh_check_supported: true,
  repair_supported: true,
  set_branch_supported: true,
  allowed_branch_targets: ['latest', '2.8.1'],
  backup_gate: { requires_recent_backup: true, has_recent_backup: true },
  force_check_pending: false,
  repair_pending: false,
  set_branch_pending: false,
  active_command: null,
  last_result: null,
};

function fixture(t) {
  const timeouts = new Set();
  const intervals = new Set();
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout: (tick) => { timeouts.add(tick); return tick; },
    clearTimeout: (tick) => timeouts.delete(tick),
    setInterval: (tick) => { intervals.add(tick); return tick; },
    clearInterval: (tick) => intervals.delete(tick),
  };
  const harness = hookHarness();
  t.after(() => { harness.unmount(); globalThis.window = previousWindow; });
  const reads = [];
  const submissions = [];
  const receipt = {
    command_id: 'synthetic-firmware-upgrade',
    status: 'pending',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const { NodePfsenseUpgradeSection } = sourceLoader({
    ...uiMocks,
    react: harness.react,
    '@/lib/pfsense-upgrade': {
      requestPfsenseUpdateRefreshCheckAction: async (id) => {
        assert.equal(id, nodeId);
        submissions.push('refresh');
        return { ok: true, data: { pending: true, requested_at: requestedAt } };
      },
      requestPfsenseUpgradeAction: async (id) => {
        assert.equal(id, nodeId);
        submissions.push('upgrade');
        return { ok: true, data: receipt };
      },
      requestPfsenseRepoRepairAction: async (id) => {
        assert.equal(id, nodeId);
        submissions.push('repair');
        return { ok: true, data: { pending: true, requested_at: requestedAt } };
      },
      requestPfsenseSetBranchAction: async (id, target) => {
        assert.equal(id, nodeId);
        assert.equal(target, '2.8.1');
        submissions.push('branch');
        return { ok: true, data: { pending: true, requested_at: requestedAt } };
      },
      pollPfsenseUpgradeStatusAction: (id) => {
        assert.equal(id, nodeId);
        const next = deferred();
        reads.push(next);
        return next.promise;
      },
    },
  })('components/node-pfsense-upgrade-section.tsx');
  const props = { nodeId, nodeEffectiveStatus: 'online', canRunUpgrade: true, initialStatus };
  const render = () => harness.render(NodePfsenseUpgradeSection, props);
  const button = (tree, label) => elements(tree).find((item) => item.type === 'button'
    && textOf(item).trim() === label);
  const tick = () => {
    const callback = intervals.values().next().value ?? timeouts.values().next().value;
    assert.equal(typeof callback, 'function');
    timeouts.delete(callback);
    callback();
  };
  return { receipt, reads, submissions, intervals, render, button, tick };
}

test('checagem aceita continua após uma falha de leitura sem reenviar o pedido', async (t) => {
  const panel = fixture(t);
  panel.button(panel.render(), 'Atualizar verificação').props.onClick();
  await settle();
  assert.deepEqual(panel.submissions, ['refresh']);
  assert.equal(panel.button(panel.render(), 'Verificando...').props.disabled, true);
  panel.tick();
  await settle();
  panel.reads[0].reject(new Error('synthetic status unavailable'));
  await settle();
  const waiting = panel.render();
  assert.equal(panel.button(waiting, 'Verificando...')?.props.disabled, true);
  assert.match(textOf(waiting), /Consulta temporariamente indisponível/);
  panel.tick();
  panel.tick();
  await settle();
  assert.equal(panel.reads.length, 2);
  panel.reads[1].resolve({
    ...initialStatus,
    force_check_requested_at: requestedAt,
    update_checked_at: '2026-11-25T19:04:00Z',
    update_available: false,
  });
  await settle();
  panel.render();
  const completed = panel.render();
  assert.match(textOf(completed), /Checagem concluída/);
  assert.equal(panel.button(completed, 'Atualizar verificação').props.disabled, false);
  assert.equal(panel.intervals.size, 0);
  assert.deepEqual(panel.submissions, ['refresh']);
});

for (const operation of [
  { kind: 'repair', open: 'Reparar repositório', confirm: 'Confirmar reparo', field: 'repair_requested_at', result: /Reparo concluído/ },
  { kind: 'branch', open: 'Apontar branch', confirm: 'Confirmar branch', field: 'set_branch_requested_at', result: /Branch atual: 2\.8\.1/ },
]) {
  test(operation.kind + ' acompanha somente o pedido aceito', async (t) => {
    const panel = fixture(t);
    panel.button(panel.render(), operation.open).props.onClick();
    elements(panel.render()).find((item) => item.type === 'input' && item.props.type === 'text')
      .props.onChange({ target: { value: 'CONFIRMAR' } });
    if (operation.kind === 'branch') {
      elements(panel.render()).find((item) => item.type === 'select')
        .props.onChange({ target: { value: '2.8.1' } });
    }
    panel.button(panel.render(), operation.confirm).props.onClick();
    await settle();
    panel.render();
    assert.deepEqual(panel.submissions, [operation.kind]);
    panel.tick();
    const previousRequest = { ...initialStatus, update_checked_at: '2026-11-25T19:04:00Z',
      [operation.field]: '2026-11-25T19:00:00Z', update_available: false };
    panel.reads[0].resolve(previousRequest);
    await settle();
    assert.doesNotMatch(textOf(panel.render()), operation.result);
    assert.equal(panel.intervals.size, 1);
    panel.tick();
    panel.reads[1].resolve({ ...previousRequest, [operation.field]: requestedAt });
    await settle();
    panel.render();
    assert.match(textOf(panel.render()), operation.result);
    assert.equal(panel.intervals.size, 0);
  });
}

test('upgrade do pfSense aceito permanece em acompanhamento após falha na consulta de status', async (t) => {
  const panel = fixture(t);
  panel.button(panel.render(), 'Atualizar pfSense').props.onClick();
  await settle();
  panel.reads[0].resolve(initialStatus);
  await settle();
  elements(panel.render()).find((item) => item.type === 'input' && item.props.type === 'text')
    .props.onChange({ target: { value: 'CONFIRMAR' } });
  panel.button(panel.render(), 'Confirmar upgrade').props.onClick();
  await settle();
  panel.reads[1].resolve(initialStatus);
  await settle();
  assert.deepEqual(panel.submissions, ['upgrade']);
  panel.reads[2].reject(new Error('synthetic status unavailable'));
  await settle();
  const waiting = panel.render();
  assert.equal(panel.button(waiting, 'Atualizar pfSense').props.disabled, true);
  assert.match(textOf(waiting), /Solicitação aceita/);
  panel.tick();
  panel.reads[3].resolve({
    ...initialStatus, update_available: false,
    last_result: { command_id: panel.receipt.command_id, status: 'succeeded' },
  });
  await settle();
  assert.match(textOf(panel.render()), /Último upgrade concluído/);
  assert.equal(panel.intervals.size, 0);
  assert.deepEqual(panel.submissions, ['upgrade']);
});
