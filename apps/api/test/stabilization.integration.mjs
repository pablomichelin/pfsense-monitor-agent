import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AccessPolicyService } from '../dist/auth/access-policy.service.js';
import { PermissionsService } from '../dist/auth/permissions.service.js';
import { TechniciansService } from '../dist/technicians/technicians.service.js';
import { TechnicianAccountsBatchController } from '../dist/technicians/technician-accounts-batch.controller.js';
import { MfaService } from '../dist/auth/mfa.service.js';

test('isolamento de clientes e consumo MFA em PostgreSQL sintético', { skip: !process.env.STABILIZATION_DATABASE_URL }, async (t) => {
  const url = new URL(process.env.STABILIZATION_DATABASE_URL);
  assert.equal(url.hostname, 'pfs-stabilization-db', 'Só permite o container descartável dedicado');
  assert.equal(url.pathname, '/monitor_stabilization');
  const prisma = new PrismaClient();
  const nonce = randomUUID();
  const permissions = new PermissionsService(prisma);
  const policy = new AccessPolicyService(prisma, permissions);
  const service = new TechniciansService(prisma, {}, policy);
  const clients = await Promise.all(['A', 'B'].map((suffix) => prisma.client.create({ data: { name: `Synthetic ${suffix}`, code: `${nonce}-${suffix}` } })));
  const users = await Promise.all(['operator', 'superadmin', 'operator'].map((role, i) => prisma.user.create({ data: { email: `${nonce}-${i}@example.invalid`, role } })));
  const [actor, globalActor, emptyActor] = users.map(({ id: userId, role }) => ({ userId, role }));
  await prisma.userClientScope.create({ data: { userId: actor.userId, clientId: clients[0].id } });
  const sites = await Promise.all(clients.map((client) => prisma.site.create({ data: { clientId: client.id, name: 'Synthetic', code: 'SYNTHETIC' } })));
  const nodes = await Promise.all(sites.map((site) => prisma.node.create({ data: { siteId: site.id, nodeUid: randomUUID(), hostname: 'synthetic.invalid' } })));
  const technicians = await Promise.all(['shared', 'external', 'orphan', 'revoked'].map((name, i) => prisma.technician.create({ data: { fullName: `Synthetic ${name}`, loginUsername: `t${nonce.replaceAll('-', '').slice(0, 12)}${i}`, notes: 'Global synthetic note', status: name === 'revoked' ? 'revoked' : 'active' } })));
  await prisma.technicianNodeAccount.createMany({ data: [
    { technicianId: technicians[0].id, nodeId: nodes[0].id, pfsenseUsername: technicians[0].loginUsername },
    { technicianId: technicians[0].id, nodeId: nodes[1].id, pfsenseUsername: technicians[0].loginUsername },
    { technicianId: technicians[1].id, nodeId: nodes[1].id, pfsenseUsername: technicians[1].loginUsername },
  ] });
  t.after(async () => {
    try {
    await prisma.client.deleteMany({ where: { id: { in: clients.map(x => x.id) } } });
    await prisma.technician.deleteMany({ where: { id: { in: technicians.map(x => x.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(x => x.id) } } });
    } finally { await prisma.$disconnect(); }
  });

  await t.test('listagem e contagem limitadas ao cliente A; nenhum escopo não vê técnicos', async () => {
    const result = await service.listTechnicians(actor);
    assert.deepEqual(result.items.map(x => x.id), [technicians[0].id]);
    assert.equal(result.items[0].node_account_count, 1);
    assert.equal(result.items[0].notes, null);
    assert.deepEqual((await service.listTechnicians(emptyActor, 'all')).items, []);
  });
  await t.test('detalhe oculta vínculo B e UUID externo não contorna o filtro', async () => {
    const result = await service.getTechnician(technicians[0].id, actor);
    assert.deepEqual(result.technician.node_accounts.map(x => x.node_id), [nodes[0].id]);
    for (const tech of technicians.slice(1)) await assert.rejects(service.getTechnician(tech.id, actor), /technician not found/);
    await assert.rejects(service.provisionNodeAccount(nodes[0].id, actor.userId, { technician_id: technicians[1].id }, actor), /technician not found/);
  });
  await t.test('cadastro compartilhado não pode ser removido ou reativado por ator restrito', async () => {
    await assert.rejects(service.revokeTechnicianFromRegistry(actor.userId, technicians[0].id, technicians[0].loginUsername, actor), /requires global client scope/);
    await assert.rejects(service.createTechnician(actor.userId, { full_name: 'Overwrite', login_username: technicians[3].loginUsername }, actor), /requires global client scope/);
    assert.equal(await prisma.technicianNodeAccount.count({ where: { technicianId: technicians[0].id } }), 2);
    assert.equal((await prisma.technician.findUnique({ where: { id: technicians[3].id } })).status, 'revoked');
  });
  await t.test('global preserva órfãos, reativação e exclusão confirmada', async () => {
    const all = await service.listTechnicians(globalActor, 'all');
    assert.ok(technicians.every(x => all.items.some(y => x.id === y.id)));
    assert.equal(all.items.find(x => x.id === technicians[0].id).node_account_count, 2);
    const reactivated = await service.createTechnician(globalActor.userId, { full_name: 'Reactivated synthetic', login_username: technicians[3].loginUsername }, globalActor);
    assert.equal(reactivated.status, 'active');
    await assert.rejects(service.revokeTechnicianFromRegistry(globalActor.userId, technicians[2].id, 'wrong-login', globalActor), /does not match/);
    await service.revokeTechnicianFromRegistry(globalActor.userId, technicians[2].id, technicians[2].loginUsername, globalActor);
    assert.equal(await prisma.technician.findUnique({ where: { id: technicians[2].id } }), null);
  });
  await t.test('lote com alvos A+B é recusado antes de enfileirar qualquer comando', async () => {
    let dispatched = 0;
    const controller = new TechnicianAccountsBatchController({ createBatchProvision: async () => { dispatched++; } }, policy);
    await assert.rejects(controller.createBatchProvision({ node_ids: nodes.map(x => x.id), technician_id: technicians[0].id }, { auth: { userId: actor.userId, role: actor.role }, headers: {} }), /client out of scope/);
    assert.equal(dispatched, 0);
  });
  await t.test('dois desafios concorrentes só consomem um código MFA uma vez', async () => {
    const hash = value => createHash('sha256').update(value).digest('hex');
    const user = await prisma.user.update({ where: { id: actor.userId }, data: { mfaEnabled: true, mfaSecret: null } });
    const recovery = `${nonce.replaceAll('-', '').slice(0, 10)}`.toUpperCase();
    const code = await prisma.mfaRecoveryCode.create({ data: { userId: user.id, codeHash: hash(recovery) } });
    const tokens = [randomUUID(), randomUUID()];
    await prisma.mfaLoginChallenge.createMany({ data: tokens.map(token => ({ userId: user.id, challengeTokenHash: hash(token), expiresAt: new Date(Date.now() + 60_000) })) });
    const mfa = new MfaService(prisma, {}, {}, {});
    const results = await Promise.allSettled(tokens.map(token => mfa.verifyLoginChallenge({ token, code: recovery })));
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    assert.ok((await prisma.mfaRecoveryCode.findUnique({ where: { id: code.id } })).usedAt);
    assert.equal(await prisma.mfaLoginChallenge.count({ where: { userId: user.id, consumedAt: { not: null } } }), 1);
  });
});
