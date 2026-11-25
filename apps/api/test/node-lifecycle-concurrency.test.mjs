import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NodeLifecycleService } from '../dist/nodes/node-lifecycle.service.js';

const nodeId = '10000000-0000-4000-8000-000000000001';

async function reconcile({
  initial, locked, currentAlert = null, updateAlertCount = 1,
  upgradeAtScan = false, upgradeAtDecision = upgradeAtScan,
}) {
  const effects = { nodes: [], created: [], updated: [], refreshed: 0, notified: [] };
  const tx = {
    $queryRaw: async () => locked ? [{
      status: locked.status,
      maintenance_mode: locked.maintenanceMode,
      last_seen_at: locked.lastSeenAt,
    }] : [],
    node: { update: async ({ data }) => { effects.nodes.push(data); } },
    alert: {
      findUnique: async () => currentAlert,
      create: async ({ data }) => {
        effects.created.push(data);
        return { id: 'created-alert' };
      },
      updateMany: async ({ where, data }) => {
        effects.updated.push({ where, data });
        return { count: updateAlertCount };
      },
    },
  };
  const service = new NodeLifecycleService(
    {
      node: { findMany: async () => [{ id: nodeId, alerts: [], ...initial }] },
      $transaction: async (work) => work(tx),
    },
    { publishDashboardRefresh: () => { effects.refreshed += 1; } },
    { loadActivePfsenseUpgradeNodeIds: async (now, options) => {
      if (options) {
        assert.deepEqual(options, { nodeId, db: tx });
      }
      return new Set((options ? upgradeAtDecision : upgradeAtScan) ? [nodeId] : []);
    } },
    { dispatchForAlertIds: (ids) => { effects.notified.push(...ids); } },
  );
  try {
    await service.onModuleInit();
    return effects;
  } finally {
    service.onModuleDestroy();
  }
}

function node(lastSeenAt, extra = {}) {
  return { status: 'online', maintenanceMode: false, lastSeenAt, ...extra };
}

test('offline reconciliation discards a snapshot superseded by a fresh heartbeat', async () => {
  const initial = node(new Date(2020, 0, 1));
  const effects = await reconcile({ initial, locked: node(new Date()) });

  assert.deepEqual(effects, { nodes: [], created: [], updated: [], refreshed: 0, notified: [] });
});

test('offline reconciliation leaves a newly enabled maintenance mode alone', async () => {
  const initial = node(new Date(2020, 0, 1));
  const effects = await reconcile({ initial, locked: { ...initial, maintenanceMode: true } });

  assert.deepEqual(effects, { nodes: [], created: [], updated: [], refreshed: 0, notified: [] });
});

test('an unchanged offline snapshot updates the status and opens one alert', async () => {
  const initial = node(new Date(2020, 0, 1));
  const effects = await reconcile({ initial, locked: initial });

  assert.deepEqual(effects.nodes, [{ status: 'offline' }]);
  assert.equal(effects.created[0].type, 'heartbeat_missing');
  assert.equal(effects.refreshed, 1);
  assert.deepEqual(effects.notified, ['created-alert']);
});

test('a stale alert observation does not reset an acknowledgement', async () => {
  const initial = node(new Date(2020, 0, 1), { status: 'offline' });
  const effects = await reconcile({
    initial, locked: initial, currentAlert: { id: 'alert', status: 'acknowledged' },
  });

  assert.deepEqual(effects, { nodes: [], created: [], updated: [], refreshed: 0, notified: [] });
});

test('reconciliation does not send a second refresh for an alert already resolved', async () => {
  const initial = node(new Date(), { alerts: [{ id: 'alert', status: 'open' }] });
  const effects = await reconcile({ initial, locked: initial, updateAlertCount: 0 });

  assert.deepEqual(effects.updated[0].where, { id: 'alert', status: { not: 'resolved' } });
  assert.equal(effects.refreshed, 0);
  assert.deepEqual(effects.notified, []);
});


test('an upgrade picked up after the scan suppresses a new offline alert', async () => {
  const initial = node(new Date(2020, 0, 1));
  const effects = await reconcile({ initial, locked: initial, upgradeAtDecision: true });

  assert.deepEqual(effects.nodes, [{ status: 'offline' }]);
  assert.deepEqual(effects.created, []);
  assert.deepEqual(effects.notified, []);
});

test('an upgrade completed after the scan leaves a current offline alert open', async () => {
  const currentAlert = { id: 'old-alert', status: 'open' };
  const initial = node(new Date(2020, 0, 1), { status: 'offline', alerts: [currentAlert] });
  const effects = await reconcile({
    initial, locked: initial, currentAlert, upgradeAtScan: true, upgradeAtDecision: false,
  });

  assert.deepEqual(effects, { nodes: [], created: [], updated: [], refreshed: 0, notified: [] });
});
