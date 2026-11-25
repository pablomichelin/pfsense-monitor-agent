import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AlertsService } from '../dist/alerts/alerts.service.js';

const actor = { userId: 'synthetic-user', email: 'user@qa.invalid', role: 'synthetic' };
const alert = { id: 'synthetic-alert', nodeId: 'synthetic-node', status: 'open' };
const accessPolicy = { assertNodeAccess: async (current, nodeId) => {
  assert.equal(current, actor);
  assert.equal(nodeId, alert.nodeId);
} };

function transitionFixture({ updated = 1, exists = true } = {}) {
  const audits = [];
  const changes = [];
  const tx = {
    alert: {
      updateMany: async ({ where, data }) => {
        assert.deepEqual(where, { id: alert.id, status: { not: 'resolved' } });
        changes.push(data);
        return { count: updated };
      },
      findUnique: async () => exists ? { id: alert.id } : null,
    },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  };
  return { changes, audits, service: new AlertsService({
    alert: { findUnique: async () => alert },
    $transaction: async work => work(tx),
  }, accessPolicy) };
}

for (const [action, mutate] of [
  ['acknowledge', (service) => service.acknowledgeAlert(actor, alert.id, actor)],
  ['resolve', (service) => service.resolveAlert(actor, alert.id, { resolution_note: 'QA' }, actor)],
]) {
  test(`${action} refuses to overwrite a resolution after it checked access`, async () => {
    const { audits, service } = transitionFixture({ updated: 0 });
    await assert.rejects(mutate(service), { status: 409 });
    assert.deepEqual(audits, []);
  });

  test(`${action} records exactly one audit in the transaction when it wins`, async () => {
    const { audits, changes, service } = transitionFixture();
    const result = await mutate(service);
    assert.equal(result.status, changes[0].status);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, `alert.${action}`);
    assert.equal(audits[0].targetId, alert.id);
  });
}

test('a deleted alert returns 404 if it disappears before the conditional update', async () => {
  const { audits, service } = transitionFixture({ updated: 0, exists: false });
  await assert.rejects(service.acknowledgeAlert(actor, alert.id, actor), { status: 404 });
  assert.deepEqual(audits, []);
});
