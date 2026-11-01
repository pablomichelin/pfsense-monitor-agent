import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { CommandOrchestratorService } from '../dist/commands/command-orchestrator.service.js';
import { NodeCommandsService } from '../dist/node-commands/node-commands.service.js';

test('comandos concorrentes em PostgreSQL descartável', { skip: !process.env.STABILIZATION_DATABASE_URL }, async (t) => {
  const url = new URL(process.env.STABILIZATION_DATABASE_URL);
  assert.equal(url.hostname, 'pfs-stabilization-db');
  assert.equal(url.pathname, '/monitor_stabilization');
  const db = new PrismaClient();
  const run = randomUUID();
  const client = await db.client.create({ data: { name: 'Synthetic command integration', code: run } });
  const site = await db.site.create({ data: { clientId: client.id, name: 'Synthetic', code: 'synthetic' } });
  const node = await db.node.create({ data: { siteId: site.id, nodeUid: run, hostname: 'synthetic.invalid' } });
  t.after(async () => { try {
    await db.client.delete({ where: { id: client.id } });
    await db.auditLog.deleteMany({ where: { actorId: run } });
  } finally { await db.$disconnect(); } });
  const orchestrator = new CommandOrchestratorService(db);
  const service = new NodeCommandsService(db, {});

  await t.test('admissão concorrente serializa por node; nova senha não reutiliza comando', async () => {
    const input = { nodeId: node.id, type: 'local_user_set_password', idempotencyKey: 'fixed-synthetic-key', payloadJson: { pfsense_username: 'synthetic', password: 'Synthetic-secret-one!' } };
    const results = await Promise.allSettled([orchestrator.enqueueCommand(input), orchestrator.enqueueCommand(input)]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    const first = results.find(x => x.status === 'fulfilled').value;
    assert.equal(first.idempotencyKey, null);
    await service.reportCommandResult({ nodeId: node.id, commandId: first.id, credentialId: run, status: 'succeeded' });
    const next = await orchestrator.enqueueCommand({ ...input, payloadJson: { ...input.payloadJson, password: 'Synthetic-secret-two!' } });
    assert.notEqual(next.id, first.id);
    assert.equal(next.payloadJson.password, 'Synthetic-secret-two!');
    await orchestrator.cancelCommand({ nodeId: node.id, commandId: next.id, cancelledByUserId: run });
  });
  await t.test('dois resultados concorrentes produzem somente uma auditoria terminal', async () => {
    const command = await orchestrator.enqueueCommand({ nodeId: node.id, type: 'service_restart', payloadJson: { service: 'unbound' } });
    const input = { nodeId: node.id, commandId: command.id, credentialId: run, status: 'succeeded' };
    const results = await Promise.all([service.reportCommandResult(input), service.reportCommandResult(input)]);
    assert.ok(results.every(x => x.status === 'succeeded'));
    assert.equal(await db.auditLog.count({ where: { targetId: command.id, action: 'service.restart.request_succeeded' } }), 1);
  });
  await t.test('resultado e cancelamento concorrentes têm um único vencedor', async () => {
    const command = await orchestrator.enqueueCommand({ nodeId: node.id, type: 'service_restart', payloadJson: { service: 'unbound' } });
    await Promise.allSettled([
      service.reportCommandResult({ nodeId: node.id, commandId: command.id, credentialId: run, status: 'failed' }),
      orchestrator.cancelCommand({ nodeId: node.id, commandId: command.id, cancelledByUserId: run }),
    ]);
    const current = await db.nodeCommand.findUnique({ where: { id: command.id } });
    assert.ok(['failed', 'cancelled'].includes(current.status));
    assert.equal(await db.auditLog.count({ where: { targetId: command.id, action: { in: ['service.restart.request_failed', 'service.restart.request_cancelled'] } } }), 1);
  });
});
