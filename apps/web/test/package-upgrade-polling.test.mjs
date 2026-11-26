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

test('upgrade aceito continua em acompanhamento durante leituras com falha e respostas antigas', async (t) => {
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
    update_available: false,
    last_result: { command_id: receipt.command_id, status: 'succeeded' },
  });
  await settle();
  tree = render();
  assert.match(textOf(tree), /concluída com sucesso/);
  assert.doesNotMatch(textOf(tree), /Solicitação aceita/);
  assert.equal(timers.size, 0);
  assert.equal(submissions, 1);
});
