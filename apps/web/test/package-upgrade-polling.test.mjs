import test from 'node:test';
import assert from 'node:assert/strict';
import { deferred, elements, hookHarness, settle, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

const nodeId = 'firewall-synthetic';
const initialStatus = {
  hostname: 'qa-firewall',
  enabled: true,
  agent_version: '0.5.30',
  min_agent_version: '0.4.6',
  published_version: '0.5.35',
  agent_version_supported: true,
  update_available: true,
  active_command: null,
  last_result: null,
};

for (const terminalStatus of ['succeeded', 'cancelled']) {
  test('upgrade aceito acompanha falhas e respostas antigas até ' + terminalStatus, async (t) => {
    const timers = new Set();
    const previousWindow = globalThis.window;
    globalThis.window = {
      setInterval: (tick) => { timers.add(tick); return tick; },
      clearInterval: (tick) => timers.delete(tick),
    };
    const harness = hookHarness();
    t.after(() => { harness.unmount(); globalThis.window = previousWindow; });
    const receipt = {
      command_id: 'synthetic-package-command',
      status: 'pending',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const reads = [];
    let submissions = 0;
    const { NodePackageUpgradeSection } = sourceLoader({
      ...uiMocks,
      react: harness.react,
      '@/lib/package-upgrade': {
        requestPackageUpgradeAction: async (id) => {
          assert.equal(id, nodeId);
          submissions += 1;
          return { ok: true, data: receipt };
        },
        pollPackageUpgradeStatusAction: (id) => {
          assert.equal(id, nodeId);
          const next = deferred();
          reads.push(next);
          return next.promise;
        },
      },
    })('components/node-package-upgrade-section.tsx');
    const props = { nodeId, canRunPackageUpgrade: true, initialStatus };
    const render = () => harness.render(NodePackageUpgradeSection, props);
    const button = (tree, label) => elements(tree).find((item) => item.type === 'button'
      && textOf(item).trim() === label);
    const upgradeButton = (tree) => button(tree, 'Atualizar package remotamente');
    const tick = () => {
      assert.equal(timers.size, 1);
      timers.values().next().value();
    };

    upgradeButton(render()).props.onClick();
    elements(render()).find((item) => item.type === 'input').props.onChange({ target: { value: 'CONFIRMAR' } });
    button(render(), 'Confirmar upgrade').props.onClick();
    await settle();
    assert.equal(submissions, 1);
    assert.equal(reads.length, 1);
    reads[0].reject(new Error('synthetic status temporarily unavailable'));
    await settle();
    let tree = render();
    assert.equal(upgradeButton(tree).props.disabled, true);
    assert.match(textOf(tree), /Solicitação aceita/);

    tick();
    tick();
    assert.equal(reads.length, 2);
    reads[1].resolve(initialStatus);
    await settle();
    assert.equal(upgradeButton(render()).props.disabled, true);
    tick();
    reads[2].resolve({
      ...initialStatus,
      agent_version: initialStatus.published_version,
      update_available: terminalStatus === 'cancelled',
      last_result: { command_id: receipt.command_id, status: terminalStatus },
    });
    await settle();
    tree = render();
    assert.match(textOf(tree), terminalStatus === 'cancelled' ? /package cancelada/ : /concluída com sucesso/);
    assert.doesNotMatch(textOf(tree), /Solicitação aceita/);
    assert.equal(timers.size, 0);
    assert.equal(submissions, 1);
  });
}

test('uma revalidação sem status suspende novo upgrade até uma leitura válida', async (t) => {
  const oldWindow = globalThis.window;
  const timers = new Set();
  globalThis.window = {
    setInterval: (tick) => { timers.add(tick); return tick; },
    clearInterval: (tick) => timers.delete(tick),
  };
  const hooks = hookHarness();
  t.after(() => { hooks.unmount(); globalThis.window = oldWindow; });
  const { NodePackageUpgradeSection } = sourceLoader({
    ...uiMocks, react: hooks.react,
    '@/lib/package-upgrade': {
      requestPackageUpgradeAction: () => assert.fail('upgrade não deveria ser solicitado'),
      pollPackageUpgradeStatusAction: async () => initialStatus,
    },
  })('components/node-package-upgrade-section.tsx');
  const render = (unavailableSince) =>
    hooks.render(NodePackageUpgradeSection, { nodeId, initialStatus, canRunPackageUpgrade: true, unavailableSince });
  const action = (tree) => elements(tree).find((item) => item.type === 'button'
    && textOf(item).trim() === 'Atualizar package remotamente');
  assert.equal(action(render()).props.disabled, false);
  assert.equal(action(render('failed-1')).props.disabled, true);
  assert.equal(timers.size, 1);
  timers.values().next().value();
  await settle();
  assert.equal(action(render('failed-1')).props.disabled, false);
  assert.equal(timers.size, 0);
  assert.equal(action(render('failed-2')).props.disabled, true);
  assert.equal(timers.size, 1);
});
