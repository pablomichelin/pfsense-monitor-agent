import test from 'node:test';
import assert from 'node:assert/strict';
import { deferred, elements, hookHarness, settle, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

const nodeId = 'firewall-synthetic';
const commandId = 'restart-synthetic';
const historyPath = '/api/v1/nodes/' + nodeId + '/commands/history?limit=25';
const cancelPath = '/api/v1/nodes/' + nodeId + '/commands/' + commandId + '/cancel';

function snapshot(status, commandIds = [commandId]) {
  const active = status === 'running';
  return {
    generated_at: '2026-11-24T12:00:00Z',
    node_id: nodeId,
    items: commandIds.map((id) => ({
      command_id: id, type: 'service_restart', status,
      requested_at: '2026-11-24T11:58:00Z',
      completed_at: active ? null : '2026-11-24T11:59:00Z',
      retry_count: 0, max_retries: 1,
      progress: { phase: active ? 'running' : 'terminal', is_active: active, is_terminal: !active },
    })),
  };
}

function historyPanel(t, { cancelResponse, historyResponses, initialHistory = snapshot('running') }) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (resource, init) => {
    const url = new URL(resource);
    assert.equal(url.origin, 'https://history.synthetic.invalid');
    const path = url.pathname + url.search;
    requests.push([init.method, path]);
    if (path === cancelPath) {
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['X-CSRF-Token'], 'synthetic-csrf');
      return cancelResponse();
    }
    assert.equal(path, historyPath);
    assert.equal(init.method, 'GET');
    assert.ok(historyResponses.length > 0);
    return historyResponses.shift()();
  });

  const timers = new Set();
  t.mock.method(globalThis, 'setInterval', (callback) => {
    timers.add(callback);
    return callback;
  });
  t.mock.method(globalThis, 'clearInterval', (callback) => timers.delete(callback));
  const hooks = hookHarness();
  t.after(() => hooks.unmount());
  const previousApiUrl = process.env.MONITOR_API_BASE_URL;
  process.env.MONITOR_API_BASE_URL = 'https://history.synthetic.invalid';
  let Panel;
  try {
    ({ NodeCommandHistoryPanel: Panel } = sourceLoader({
      ...uiMocks,
      react: hooks.react,
      'next/headers': {
        headers: async () => new Headers(),
        cookies: async () => ({ get: () => ({ value: 'synthetic-csrf' }) }),
      },
      'next/cache': { revalidatePath: (path) => assert.equal(path, '/nodes/' + nodeId) },
    })('components/nodes/node-command-history-panel.tsx'));
  } finally {
    if (previousApiUrl === undefined) delete process.env.MONITOR_API_BASE_URL;
    else process.env.MONITOR_API_BASE_URL = previousApiUrl;
  }

  const render = () => hooks.render(Panel, {
    nodeId, initialHistory, canCancelServiceRestart: true,
  });
  const cancelButton = (tree) => elements(tree).find((element) => element.type === 'button' && textOf(element) === 'Cancelar');
  return {
    render, cancelButton, requests, timers,
    status: (tree, id = commandId) => {
      const row = elements(tree).find((element) => element.type === 'tr' && element.key === id);
      return elements(row).find((element) => element.type?.name === 'NodeCommandProgress').props.status;
    },
    cancel: async () => {
      cancelButton(render()).props.onClick();
      await hooks.transitions.at(-1);
      return render();
    },
    poll: async () => {
      assert.equal(timers.size, 1);
      timers.values().next().value();
      await settle();
      return render();
    },
  };
}

test('cancelamento aceito permanece Cancelado após a primeira leitura falhar e uma leitura antiga chegar', async (t) => {
  const panel = historyPanel(t, {
    cancelResponse: () => Response.json({ ok: true, command_id: commandId, status: 'cancelled' }, { status: 201 }),
    historyResponses: [
      () => Response.json({ message: 'Histórico sintético indisponível' }, { status: 503 }),
      () => Response.json(snapshot('running')),
      () => Response.json(snapshot('cancelled')),
    ],
  });
  const failedRead = await panel.cancel();
  assert.equal(panel.status(failedRead), 'cancelled');
  assert.equal(panel.cancelButton(failedRead), undefined);
  assert.match(textOf(failedRead), /Histórico sintético indisponível/);

  const stale = await panel.poll();
  assert.equal(panel.status(stale), 'cancelled');
  assert.equal(panel.cancelButton(stale), undefined);

  const confirmed = await panel.poll();
  assert.equal(panel.status(confirmed), 'cancelled');
  assert.equal(panel.cancelButton(confirmed), undefined);
  assert.doesNotMatch(textOf(confirmed), /Histórico sintético indisponível/);
  assert.equal(panel.timers.size, 0);
  assert.deepEqual(panel.requests, [
    ['POST', cancelPath], ['GET', historyPath], ['GET', historyPath], ['GET', historyPath],
  ]);
});

test('cancelamento recusado mantém o estado e o controle indicados pelo histórico', async (t) => {
  for (const status of [409, 500]) {
    await t.test('POST ' + status, async (scenario) => {
      const panel = historyPanel(scenario, {
        cancelResponse: () => Response.json({ message: 'Cancelamento sintético recusado' }, { status }),
        historyResponses: [],
      });
      const tree = await panel.cancel();
      assert.equal(panel.status(tree), 'running');
      assert.equal(panel.cancelButton(tree).props.disabled, false);
      assert.match(textOf(tree), /Cancelamento sintético recusado/);
      assert.deepEqual(panel.requests, [['POST', cancelPath]]);
    });
  }
});

test('histórico evita consultas concorrentes e descarta a resposta anterior ao cancelamento', async (t) => {
  const otherCommand = 'another-synthetic-command';
  const older = deferred();
  const panel = historyPanel(t, {
    initialHistory: snapshot('running', [commandId, otherCommand]),
    cancelResponse: () => Response.json({ ok: true, command_id: commandId, status: 'cancelled' }, { status: 201 }),
    historyResponses: [
      () => older.promise,
      () => Response.json(snapshot('cancelled', [commandId, otherCommand])),
    ],
  });
  panel.render();
  await panel.poll();
  await panel.poll();
  assert.deepEqual(panel.requests, [['GET', historyPath]]);

  const latest = await panel.cancel();
  assert.equal(panel.status(latest, otherCommand), 'cancelled');
  assert.equal(panel.timers.size, 0);
  older.resolve(Response.json(snapshot('running', [commandId, otherCommand])));
  await settle();
  const afterOldRead = panel.render();
  assert.equal(panel.status(afterOldRead, otherCommand), 'cancelled');
  assert.equal(panel.timers.size, 0);
});

test('recibo com command_id diferente não marca outro comando do histórico como Cancelado', async (t) => {
  const otherCommandId = 'other-restart-synthetic';
  const panel = historyPanel(t, {
    initialHistory: snapshot('running', [commandId, otherCommandId]),
    cancelResponse: () => Response.json({ ok: true, command_id: otherCommandId, status: 'cancelled' }, { status: 201 }),
    historyResponses: [() => Response.json({ message: 'Histórico sintético indisponível' }, { status: 503 })],
  });
  const tree = await panel.cancel();
  assert.equal(panel.status(tree, commandId), 'running');
  assert.equal(panel.status(tree, otherCommandId), 'running');
  assert.equal(elements(tree).filter((element) => element.type === 'button' && textOf(element) === 'Cancelar').length, 2);
  assert.deepEqual(panel.requests, [['POST', cancelPath], ['GET', historyPath]]);
});

test('rota de detalhe monta o histórico com a chave do firewall atual', async () => {
  const childComponents = Object.fromEntries([
    'delete-node-button', 'nodes/node-command-history-panel', 'nodes/node-operational-actions-section',
    'nodes/node-detail-alerts-tab', 'nodes/node-detail-backup-tab', 'nodes/node-detail-config-tab',
    'nodes/node-detail-metrics-tab', 'nodes/node-detail-overview-tab', 'nodes/node-detail-tabs',
    'nodes/node-technician-accounts-panel', 'ui/status-badge',
  ].map((path) => ['@/components/' + path, new Proxy({}, { get: () => path })]));
  const page = sourceLoader({
    ...uiMocks, ...childComponents,
    'next/navigation': {
      notFound: () => assert.fail('Firewall sintético deveria existir'),
      redirect: () => assert.fail('Rota sintética não deveria redirecionar'),
    },
    '@/lib/api': {
      ApiError: class ApiError extends Error {},
      getNodeDetails: async (id) => ({ node: {
        id, hostname: id, node_uid: id, last_seen_at: null, effective_status: 'online',
        client: { id: 'client', name: 'Sintético' }, site: { name: 'Sintético' },
      } }),
      getSession: async () => ({ user: { role: 'readonly' }, permissions: ['firewalls.view'] }),
      getPfsenseUpgradeStatus: async () => ({}),
      getPackageUpgradeStatus: async () => ({}),
      getNodeMetricsHistory: async () => ({}),
      getNodeCommandHistory: async (id) => ({ node_id: id, items: [] }),
      getOperationalActionsStatus: async () => ({ enabled: false }),
    },
  })('app/nodes/[id]/page.tsx').default;

  for (const id of ['firewall-a', 'firewall-b', 'firewall-a']) {
    const pageTree = await page({ params: Promise.resolve({ id }) });
    const tabs = elements(pageTree).find((element) => element.type === 'nodes/node-detail-tabs');
    const history = elements(tabs.props.history).find((element) => element.type === 'nodes/node-command-history-panel');
    assert.equal(history.key, id);
    assert.equal(history.props.nodeId, id);
    assert.equal(history.props.initialHistory.node_id, id);
  }
});
