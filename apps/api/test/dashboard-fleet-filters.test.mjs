import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DashboardService } from '../dist/dashboard/dashboard.service.js';
import { RealtimeService } from '../dist/realtime/realtime.service.js';

const actor = { userId: 'synthetic-user', role: 'synthetic-role' };
const query = { client_id: 'synthetic-client', site_id: 'synthetic-site', status: 'online' };

function makeNode(id, status) {
  return {
    id, status, lastSeenAt: new Date(), site: { timezone: 'UTC' },
    configBackups: [], nodeCommands: [],
  };
}

test('fleet alert totals follow tenant, site and derived status filters', async () => {
  const scopedWhere = { AND: [
    { siteId: query.site_id, site: { clientId: query.client_id } },
    { site: { clientId: { in: [query.client_id] } } },
  ] };
  const service = new DashboardService({
    node: { findMany: async ({ where, select }) => {
      assert.equal(where, scopedWhere);
      assert.deepEqual(Object.keys(select ?? {}).sort(), [
        'agentVersion', 'configBackupPolicyJson', 'configBackups', 'id', 'lastSeenAt',
        'maintenanceMode', 'nodeCommands', 'pfsenseVersion', 'site', 'status',
      ]);
      return [makeNode('online-node', 'online'), makeNode('degraded-node', 'degraded')];
    } },
    alert: { groupBy: async ({ by, where, _count }) => {
      assert.deepEqual(by, ['nodeId', 'severity']);
      assert.deepEqual(where, { node: scopedWhere, status: 'open' });
      assert.deepEqual(_count, { _all: true });
      return [
        { nodeId: 'online-node', severity: 'warning', _count: { _all: 2 } },
        { nodeId: 'online-node', severity: 'critical', _count: { _all: 1 } },
        { nodeId: 'degraded-node', severity: 'critical', _count: { _all: 4 } },
      ];
    } },
  }, {
    getAllowedClientIds: async () => [query.client_id],
    assertRequestedClientFilter: async (user, clientId) => {
      assert.equal(user, actor);
      assert.equal(clientId, query.client_id);
    },
    mergeNodeWhere: async (user, baseWhere) => {
      assert.equal(user, actor);
      assert.deepEqual(baseWhere, scopedWhere.AND[0]);
      return scopedWhere;
    },
  }, { getPublishedVersion: () => null }, new RealtimeService());

  const result = await service.getFleet(actor, query);
  assert.deepEqual(result.filters, query);
  assert.equal(result.totals.nodes, 1);
  assert.equal(result.totals.open_alerts, 3);
  assert.equal(result.totals.critical_alerts, 1);
});

test('fleet and summary caches refresh after a dashboard event', async () => {
  const realtimeService = new RealtimeService();
  const reads = [];
  let node = makeNode('node', 'online');
  const service = new DashboardService({
    node: { findMany: async () => { reads.push(node.status); return [node]; } },
    alert: { count: async () => 0, groupBy: async () => [] },
  }, {
    getAllowedClientIds: async () => null,
    assertRequestedClientFilter: async () => {},
    mergeNodeWhere: async (user, where = {}) => where,
    mergeAlertWhere: async (user, where) => where,
  }, { getPublishedVersion: () => null }, realtimeService);
  const getBoth = () => Promise.all([service.getFleet(actor), service.getSummary(actor)]);

  assert.deepEqual((await getBoth()).map((row) => row.totals.online), [1, 1]);
  await getBoth();
  assert.deepEqual(reads, ['online', 'online']);

  node = makeNode('node', 'degraded');
  realtimeService.publishDashboardRefresh({
    source: 'heartbeat_ingested',
    occurred_at: new Date().toISOString(),
    node_id: node.id,
  });
  assert.deepEqual((await getBoth()).map((row) => row.totals.degraded), [1, 1]);
  await getBoth();
  assert.deepEqual(reads, ['online', 'online', 'degraded', 'degraded']);
});


test('a read started before a refresh cannot populate the current dashboard cache', async () => {
  const realtimeService = new RealtimeService();
  const began = Promise.withResolvers();
  const delayed = Promise.withResolvers();
  let calls = 0;
  const service = new DashboardService({
    node: { findMany: async () => {
      calls += 1;
      if (calls === 1) {
        began.resolve();
        return delayed.promise;
      }
      return [makeNode('node', 'degraded')];
    } },
    alert: { groupBy: async () => [] },
  }, {
    getAllowedClientIds: async () => null,
    assertRequestedClientFilter: async () => {},
    mergeNodeWhere: async (user, where) => where,
  }, { getPublishedVersion: () => null }, realtimeService);

  const oldResponse = service.getFleet(actor);
  await began.promise;
  realtimeService.publishDashboardRefresh({
    source: 'node_reconciled', occurred_at: new Date().toISOString(),
  });
  const current = await service.getFleet(actor);
  assert.equal(current.totals.online, 0);
  assert.equal(current.totals.degraded, 1);

  delayed.resolve([makeNode('node', 'online')]);
  assert.equal((await oldResponse).totals.online, 1);
  assert.equal(await service.getFleet(actor), current);
  assert.equal(calls, 2);
});


test('dashboard caches remain bounded and retain recent accesses', async () => {
  let reads = 0;
  const service = new DashboardService({
    node: { findMany: async () => { reads++; return []; } },
    alert: { count: async () => 0, groupBy: async () => [] },
  }, {
    getAllowedClientIds: async () => null,
    assertRequestedClientFilter: async () => {},
    mergeNodeWhere: async (_user, where = {}) => where,
    mergeAlertWhere: async (_user, where) => where,
  }, { getPublishedVersion: () => null }, new RealtimeService());
  const load = (index) => {
    const user = { ...actor, userId: `qa-user-${index}` };
    return Promise.all([service.getSummary(user), service.getFleet(user)]);
  };
  for (let i = 0; i < 256; i++) await load(i);
  await load(0);
  await load(256);
  await load(0);
  assert.equal(reads, 514);
  await load(1);
  assert.equal(reads, 516);
});
