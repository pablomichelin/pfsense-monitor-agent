import test from 'node:test';
import assert from 'node:assert/strict';
import { deferred, elements, hookHarness, settle, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

const initialStatus = {
  enabled: true,
  service_restart_enabled: true,
  recovery_supported: false,
  agent_version_supported: true,
  node_reboot_enabled: true,
  allowed_services: ['unbound'],
  reboot_default_delay_seconds: 60,
  maintenance_mode: false,
  active_service_restart: null,
  latest_service_restart: null,
  active_reboot: null,
};
const restart = { command_id: 'restart-synthetic', status: 'pending', payload_json: null };
const reboot = { command_id: 'reboot-synthetic', status: 'pending', payload_json: null };
const completedRestart = {
  command_id: restart.command_id,
  status: 'succeeded',
  completed_at: '2026-11-24T16:00:00Z',
  error_message: null,
};

function operationalPanel(t, status = initialStatus, { deferSubmission = false } = {}) {
  const timers = new Set();
  t.mock.method(globalThis, 'setInterval', (tick) => {
    timers.add(tick);
    return tick;
  });
  t.mock.method(globalThis, 'clearInterval', (tick) => timers.delete(tick));

  const harness = hookHarness();
  t.after(() => harness.unmount());
  const reads = [];
  const submissions = [];
  const pendingSubmissions = [];
  const completeSubmission = (receipt) => {
    if (!deferSubmission) return receipt;
    const response = deferred();
    pendingSubmissions.push({ ...response, receipt });
    return response.promise;
  };
  const { NodeOperationalActionsSection } = sourceLoader({
    ...uiMocks,
    react: harness.react,
    '@/lib/operational-actions-actions': {
      fetchOperationalActionsStatus: (nodeId) => {
        const response = deferred();
        reads.push({ ...response, nodeId });
        return response.promise;
      },
      requestServiceRestartAction: async (nodeId, service) => {
        submissions.push(['restart', nodeId, service]);
        return completeSubmission({ command_id: restart.command_id, status: restart.status, service });
      },
      requestNodeRebootAction: async (nodeId, input) => {
        submissions.push(['reboot', nodeId, input]);
        return completeSubmission({ command_id: reboot.command_id, status: reboot.status, maintenance_mode_enabled: true });
      },
    },
  })('components/nodes/node-operational-actions-section.tsx');
  const props = {
    nodeId: 'firewall-synthetic',
    hostname: 'fixture',
    canRestartService: true,
    canReboot: true,
    initialStatus: status,
  };
  let tree;
  const render = (updatedProps = {}) => {
    Object.assign(props, updatedProps);
    tree = harness.render(NodeOperationalActionsSection, props);
  };
  const button = (label) => elements(tree).find((item) => (
    item.type === 'button' && textOf(item).replace(/\s+/g, ' ').trim().startsWith(label)
  ));
  const submitRestart = () => button('Reiniciar DNS').props.onClick();
  const submitReboot = () => {
    button('Solicitar reboot').props.onClick();
    render();
    elements(tree).find((item) => item.type === 'input' && item.props.autoComplete === 'off')
      .props.onChange({ target: { value: 'CONFIRMAR' } });
    render();
    assert.equal(button('Confirmar reboot').props.disabled, false);
    button('Confirmar reboot').props.onClick();
  };
  render();

  return {
    render, button, submitRestart, submitReboot, timers, reads, submissions, pendingSubmissions,
    progressLabels: () => elements(tree)
      .filter((item) => item.type?.name === 'NodeCommandProgress')
      .map((item) => textOf(item.type(item.props)).trim()),
    tick: () => {
      assert.equal(timers.size, 1);
      timers.values().next().value();
    },
    text: () => textOf(tree),
    finishSubmission: () => harness.transitions.at(-1),
  };
}

for (const operation of [
  { type: 'restart', submit: 'submitRestart', button: 'Reiniciar DNS', activeLabel: /Comando ativo/ },
  { type: 'reboot', submit: 'submitReboot', button: 'Solicitar reboot', activeLabel: /Reboot em andamento/ },
]) {
  test(operation.type + ' aceito continua em acompanhamento após falha na primeira consulta', async (t) => {
    const panel = operationalPanel(t);
    panel[operation.submit]();
    await settle();
    assert.equal(panel.submissions.length, 1);
    assert.equal(panel.submissions[0][0], operation.type);
    panel.reads[0].reject(new Error('Consulta sintética indisponível'));
    await panel.finishSubmission();
    panel.render();

    assert.equal(panel.timers.size, 1, 'o comando aceito deve continuar sendo consultado');
    assert.match(panel.text(), operation.activeLabel);
    assert.deepEqual(panel.progressLabels(), ['Pendente']);
    assert.match(panel.text(), /Consulta sintética indisponível/);
    assert.equal(panel.button(operation.button).props.disabled, true);

    panel.tick();
    panel.tick();
    assert.equal(panel.reads.length, 2, 'o próximo intervalo não deve sobrepor a consulta em andamento');
    panel.reads[1].resolve({
      ...initialStatus,
      latest_service_restart: operation.type === 'restart' ? completedRestart : null,
    });
    await settle();
    panel.render();
    assert.doesNotMatch(panel.text(), operation.activeLabel);
    assert.doesNotMatch(panel.text(), /Consulta sintética indisponível/);
    assert.equal(panel.button(operation.button).props.disabled, false);
    assert.equal(panel.timers.size, 0);
    assert.equal(panel.submissions.length, 1);
  });

  test(operation.type + ' de A não atualiza B quando o recibo chega após a troca de nodeId', async (t) => {
    const panel = operationalPanel(t, initialStatus, { deferSubmission: true });
    panel[operation.submit]();
    await settle();
    const [pending] = panel.pendingSubmissions;
    assert.equal(panel.submissions[0][1], 'firewall-synthetic');
    panel.render({ nodeId: 'firewall-b', hostname: 'firewall-b' });

    pending.resolve(pending.receipt);
    await settle();
    assert.deepEqual(panel.reads.map((read) => read.nodeId), [], 'o recibo antigo não deve iniciar uma consulta para A');
    await panel.finishSubmission();
    panel.render();

    assert.doesNotMatch(panel.text(), operation.activeLabel);
    assert.equal(panel.timers.size, 0);
  });

  test(operation.type + ' anterior não exibe erro após navegar de A para B e voltar a A', async (t) => {
    const panel = operationalPanel(t, initialStatus, { deferSubmission: true });
    panel[operation.submit]();
    await settle();
    const [pending] = panel.pendingSubmissions;
    panel.render({ nodeId: 'firewall-b', hostname: 'firewall-b' });
    panel.render({ nodeId: 'firewall-synthetic', hostname: 'fixture' });

    pending.reject(new Error('Falha sintética da ação antiga'));
    await panel.finishSubmission();
    panel.render();

    assert.doesNotMatch(panel.text(), /Falha sintética da ação antiga/);
    assert.equal(panel.reads.length, 0);
  });
}

for (const obsolete of ['resultado', 'erro']) {
  test('poll anterior ao reboot não sobrescreve o estado com ' + obsolete + ' atrasado', async (t) => {
    const before = { ...initialStatus, active_service_restart: restart };
    const panel = operationalPanel(t, before);
    panel.tick();
    panel.submitReboot();
    await settle();
    assert.equal(panel.reads.length, 2);
    panel.reads[1].resolve({
      ...initialStatus,
      maintenance_mode: true,
      active_reboot: reboot,
      latest_service_restart: completedRestart,
    });
    await panel.finishSubmission();
    panel.render();
    assert.match(panel.text(), /Reboot em andamento/);
    assert.match(panel.text(), /Último pedido de reinício/);

    if (obsolete === 'resultado') {
      panel.reads[0].resolve(before);
    } else {
      panel.reads[0].reject(new Error('Erro sintético da leitura anterior'));
    }
    await settle();
    panel.render();
    assert.match(panel.text(), /Reboot em andamento/);
    assert.match(panel.text(), /Último pedido de reinício/);
    assert.doesNotMatch(panel.text(), /Erro sintético da leitura anterior/);
    assert.equal(panel.button('Solicitar reboot').props.disabled, true);
    assert.equal(panel.submissions.length, 1);
  });
}
