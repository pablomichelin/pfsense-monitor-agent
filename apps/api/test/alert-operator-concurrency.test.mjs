import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AlertsService } from '../dist/alerts/alerts.service.js';
import { RealtimeService } from '../dist/realtime/realtime.service.js';

const actor = { userId: 'synthetic-user', email: 'user@qa.invalid', role: 'synthetic' };
const alert = { id: 'synthetic-alert', nodeId: 'synthetic-node', status: 'open' };
const accessPolicy = { assertNodeAccess: async (current, nodeId) => {
  assert.equal(current, actor);
  assert.equal(nodeId, alert.nodeId);
} };

function transitionFixture({
  updated = 1,
  current = { status: 'resolved', acknowledgedAt: null, acknowledgedBy: null },
} = {}) {
  const audits = [];
  const changes = [];
  const realtime = new RealtimeService();
  const tx = {
    alert: {
      updateMany: async ({ where, data }) => {
        assert.deepEqual(where, {
          id: alert.id,
          status: data.status === 'acknowledged' ? 'open' : { not: 'resolved' },
        });
        changes.push(data);
        return { count: updated };
      },
      findUnique: async () => current,
    },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  };
  return { changes, audits, realtime, service: new AlertsService({
    alert: { findUnique: async () => alert },
    $transaction: async work => work(tx),
  }, accessPolicy, realtime) };
}

for (const [action, mutate] of [
  ['acknowledge', (service) => service.acknowledgeAlert(actor, alert.id, actor)],
  ['resolve', (service) => service.resolveAlert(actor, alert.id, { resolution_note: 'QA' }, actor)],
]) {
  test(`${action} refuses to overwrite a resolution after it checked access`, async () => {
    const { audits, realtime, service } = transitionFixture({ updated: 0 });
    await assert.rejects(mutate(service), { status: 409 });
    assert.deepEqual(audits, []);
    assert.equal(realtime.getDashboardRevision(), 0);
  });

  test(`${action} records exactly one audit in the transaction when it wins`, async () => {
    const { audits, changes, realtime, service } = transitionFixture();
    const result = await mutate(service);
    assert.equal(result.status, changes[0].status);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, `alert.${action}`);
    assert.equal(audits[0].targetId, alert.id);
    assert.equal(realtime.getDashboardRevision(), 1);
  });
}

test('a deleted alert returns 404 if it disappears before the conditional update', async () => {
  const { audits, service } = transitionFixture({ updated: 0, current: null });
  await assert.rejects(service.acknowledgeAlert(actor, alert.id, actor), { status: 404 });
  assert.deepEqual(audits, []);
});

test('an acknowledgement retry returns the first recorded operator and emits no duplicate audit', async () => {
  const acknowledgedAt = new Date('2026-11-25T11:00:00Z');
  const acknowledgedBy = 'first-operator@qa.invalid';
  const { audits, realtime, service } = transitionFixture({
    updated: 0, current: { status: 'acknowledged', acknowledgedAt, acknowledgedBy },
  });
  assert.deepEqual(await service.acknowledgeAlert(actor, alert.id, actor), {
    alert_id: alert.id,
    status: 'acknowledged',
    acknowledged_at: acknowledgedAt.toISOString(),
    acknowledged_by: acknowledgedBy,
  });
  assert.deepEqual(audits, []);
  assert.equal(realtime.getDashboardRevision(), 0);
});
