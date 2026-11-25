import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (mod, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
  });
  mod._compile(outputText, filename);
};
let IngestService;
try {
  ({ IngestService } = require('../src/ingest/ingest.service.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

const nodeId = '10000000-0000-4000-8000-000000000001';
const sentAt = '2026-01-01T00:00:02.000Z';
const priorHeartbeat = {
  last_heartbeat_id: 'prior',
  last_heartbeat_sent_at: new Date('2026-01-01T00:00:01.000Z'),
  maintenance_mode: false,
  last_seen_at: null,
  status: 'degraded',
};

function fixture({ services = [], gateways = [], lockedNode = priorHeartbeat, previousHeartbeatId = 'earlier' } = {}) {
  const state = { updates: [], presence: [], recoveredChecks: [], deliveries: 0, refreshes: 0 };
  const advanceContact = async ({ where, data }) => {
    state.updates.push(data);
    state.presence.push({ where, data });
    return { count: 1 };
  };
  const command = { id: 'synthetic-command', type: 'service_restart', expires_at: sentAt };
  const tx = {
    $queryRaw: async () => [lockedNode],
    node: {
      update: async ({ data }) => { state.updates.push(data); },
      updateMany: advanceContact,
    },
    nodeCredential: { update: async () => {} },
    nodeServiceStatus: {
      findMany: async () => { state.recoveredChecks.push('services'); return services; },
      deleteMany: async () => {},
    },
    nodeGatewayStatus: {
      findMany: async () => { state.recoveredChecks.push('gateways'); return gateways; },
      deleteMany: async () => {},
    },
    alert: { findMany: async () => [] },
  };
  const db = {
    $transaction: async (run) => run(tx),
    // Before acquiring the lock, the preceding heartbeat has yet to commit.
    nodeServiceStatus: { findMany: async () => [] },
    nodeGatewayStatus: { findMany: async () => [] },
    node: { findUnique: async () => null, updateMany: advanceContact },
    nodeCredential: { update: async () => {} },
    site: { findUnique: async () => ({ clientId: 'synthetic-client' }) },
  };
  const service = new IngestService(
    db,
    {
      authenticateNodeRequest: async () => ({
        headerNodeUid: 'synthetic-node',
        node: { id: nodeId, lastHeartbeatId: previousHeartbeatId, maintenanceMode: false, status: 'online' },
        credential: { id: 'synthetic-credential' },
      }),
      parseIsoDate: (value) => new Date(value),
    },
    { reconcileSucceededCommands: async () => {} },
    { getPendingCommandsForNode: async () => { state.deliveries += 1; return [command]; } },
    { publishDashboardRefresh: () => { state.refreshes += 1; } },
    { dispatchForAlertIds: () => {} },
  );
  const ingest = (body) => service.ingestHeartbeat({
    body: {
      heartbeat_id: 'current', sent_at: sentAt, node_uid: 'synthetic-node',
      hostname: 'synthetic', customer_code: 'synthetic', schema_version: '1',
      pfsense_version: '2.8.1', uptime_sec: 10, ...body,
    },
    rawBody: Buffer.alloc(0),
  });
  return { state, command, ingest, service };
}

test('partial heartbeat inherits stopped services committed before it acquired the node lock', async () => {
  const { state, command, ingest } = fixture({ services: [{ serviceName: 'unbound', status: 'stopped' }] });
  const result = await ingest({ gateways: [] });
  assert.equal(result.node_status, 'degraded');
  assert.equal(state.updates[0].status, 'degraded');
  assert.deepEqual(state.recoveredChecks, ['services']);
  assert.deepEqual(result.commands, [command]);
});

test('partial heartbeat inherits down gateways committed before it acquired the node lock', async () => {
  const { state, ingest } = fixture({ gateways: [{ gatewayName: 'WAN_GW', status: 'down' }] });
  const result = await ingest({ services: [] });
  assert.equal(result.node_status, 'degraded');
  assert.equal(state.updates[0].status, 'degraded');
  assert.deepEqual(state.recoveredChecks, ['gateways']);
});

test('complete heartbeat uses provided empty lists instead of the preceding snapshot', async () => {
  const { state, ingest } = fixture({ services: [{ serviceName: 'unbound', status: 'stopped' }] });
  const result = await ingest({ services: [], gateways: [] });
  assert.equal(result.node_status, 'online');
  assert.equal(state.updates[0].status, 'online');
  assert.deepEqual(state.recoveredChecks, []);
});

test('heartbeat honors maintenance enabled after authentication and before row lock', async () => {
  const { state, ingest } = fixture({ lockedNode: { ...priorHeartbeat, maintenance_mode: true } });
  const result = await ingest({ services: [], gateways: [] });
  assert.equal(result.node_status, 'maintenance');
  assert.equal(state.updates[0].status, 'maintenance');
});

for (const [label, lockedNode] of [
  ['stale', { ...priorHeartbeat, last_heartbeat_sent_at: new Date('2026-01-01T00:00:03.000Z') }],
  ['concurrently applied', { ...priorHeartbeat, last_heartbeat_id: 'current' }],
]) {
  test(`${label} heartbeat reports the locked status without applying telemetry or delivering commands`, async () => {
    const { state, ingest } = fixture({ lockedNode });
    const result = await ingest({});
    assert.equal(result.node_status, 'degraded');
    assert.equal(result.commands, undefined);
    assert.deepEqual(state.updates.map(Object.keys), [['lastSeenAt']]);
    assert.deepEqual(state.recoveredChecks, []);
    assert.equal(state.deliveries, 0);
    assert.equal(state.refreshes, 0);
  });
}

test('an accepted heartbeat keeps the latest contact read under the lock', async () => {
  const previousContact = new Date(Date.now() + 1000);
  const { state, ingest } = fixture({ lockedNode: { ...priorHeartbeat, last_seen_at: previousContact } });
  await ingest({ services: [], gateways: [] });

  assert.equal(state.updates[0].lastSeenAt, previousContact);
});

for (const [label, options] of [
  ['already read as a duplicate', { previousHeartbeatId: 'current' }],
  ['found stale under the lock', { lockedNode: { ...priorHeartbeat, last_heartbeat_sent_at: new Date('2026-01-01T00:00:03.000Z') } }],
]) {
  test(`a heartbeat ${label} advances last contact only when newer`, async () => {
    const { state, ingest } = fixture(options);
    const result = await ingest({});
    const [presence] = state.presence;

    assert.deepEqual(presence.where, {
      id: nodeId,
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: presence.data.lastSeenAt } }],
    });
    assert.equal(result.commands, undefined);
  });
}


test('omitted interfaces preserve the snapshot and explicit lists can replace it', async () => {
  const interfaces = [{ name: 'QA Transit', ip: '192.0.2.27', role: 'opt1' }];
  for (const snapshot of [undefined, [], interfaces]) {
    const { state, ingest } = fixture();
    await ingest({ interfaces: snapshot });

    assert.deepEqual(state.updates[0].networkInterfacesJson, snapshot);
  }
});


test('observing the same service and gateway faults preserves their lifecycle fields', async () => {
  const { service } = fixture();
  const observedAt = new Date(sentAt);
  const existing = [
    { id: 'service-alert', status: 'acknowledged', type: 'service_down', fingerprint: `service_down:${nodeId}:unbound` },
    { id: 'gateway-alert', status: 'resolved', type: 'gateway_down', fingerprint: `gateway_down:${nodeId}:LINK_A` },
  ];
  const updates = new Map();
  const notifications = await service.syncAlerts({ alert: {
    findMany: async () => existing,
    update: async ({ where, data }) => { updates.set(where.id, data); },
  } }, nodeId, {
    services: [{ name: 'unbound', status: 'stopped' }],
    gateways: [{ name: 'LINK_A', status: 'down' }],
  }, observedAt, { syncServices: true, syncGateways: true });

  assert.equal(updates.size, 2);
  assert.equal('status' in updates.get('service-alert'), false);
  assert.equal('acknowledgedAt' in updates.get('service-alert'), false);
  assert.equal('resolvedAt' in updates.get('service-alert'), false);
  assert.equal(updates.get('gateway-alert').status, 'open');
  assert.equal(updates.get('gateway-alert').openedAt, observedAt);
  assert.equal(updates.get('gateway-alert').acknowledgedAt, null);
  assert.deepEqual(notifications, ['gateway-alert']);
});
