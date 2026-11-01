import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
const appRequire = createRequire('/app/package.json');

// Explicit opt-in only. Never inherit DATABASE_URL or read .env. This file is
// mounted under /qa; dependencies resolve explicitly from /app/package.json.
const qaUrl = process.env.COMMAND_RECOVERY_PG_URL;
process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/never_connect';
process.env.AUTH_BOOTSTRAP_EMAIL = 'synthetic@example.invalid';
process.env.AUTH_BOOTSTRAP_PASSWORD = 'Synthetic-only-password-2026!';
process.env.NODE_SECRET_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
process.env.BACKUP_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
process.env.TRUST_PROXY = 'false';
process.env.TECHNICIAN_ACCOUNTS_ENABLED = 'true';
process.env.TECHNICIAN_ACCOUNT_CREATE_ENABLED = 'true';
process.env.TECHNICIAN_ACCOUNT_PASSWORD_RESET_ENABLED = 'true';

const sentinel = 'pfs-command-recovery-qa-only-20261101';
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const txProxy = (db, wrap) => new Proxy(db, {
  get(target, property) {
    if (property === '$transaction') return work => target.$transaction(
      async tx => work(await wrap(tx)), { timeout: 15_000, maxWait: 5_000 },
    );
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

// No Docker/SSH/migration commands in this harness. The coordinator supplies a
// migrated, isolated PG17 database and sentinel BEFORE enabling this test.
test('PG17 durable recovery: real database transactions and concurrent connections', {
  skip: !qaUrl, timeout: 120_000,
}, async t => {
  const url = new URL(qaUrl);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, 'db');
  assert.equal(url.pathname, '/monitor_qa');
  assert.equal(url.username, 'qa');
  assert.ok(!url.port || url.port === '5432');
  assert.ok(!url.searchParams.has('host'), 'socket/host overrides are forbidden');
  assert.ok(!url.searchParams.has('schema'), 'schema overrides are forbidden');
  const selectedCase = process.env.COMMAND_RECOVERY_PG_CASE;
  assert.ok(!selectedCase || selectedCase === 'disconnect', 'unknown PG case selector');
  url.searchParams.set('connection_limit', '4');
  url.searchParams.set('connect_timeout', '5');
  url.searchParams.set('pool_timeout', '5');
  const { PrismaClient } = appRequire('@prisma/client');
  const a = new PrismaClient({ datasourceUrl: url.toString() });
  const b = new PrismaClient({ datasourceUrl: url.toString() });
  let rootClient, technician, scratch;
  t.after(async () => {
    try {
      if (rootClient) {
        const nodes = await a.node.findMany({ where: { site: { clientId: rootClient.id } }, select: { id: true } });
        const nodeIds = nodes.map(x => x.id);
        const commands = await a.nodeCommand.findMany({ where: { nodeId: { in: nodeIds } }, select: { id: true } });
        const backups = await a.nodeConfigBackup.findMany({ where: { nodeId: { in: nodeIds } }, select: { id: true } });
        await a.auditLog.deleteMany({ where: { OR: [
          { actorId: rootClient.code },
          { targetId: { in: [...nodeIds, ...commands.map(x => x.id), ...backups.map(x => x.id)] } },
        ] } });
        await a.client.delete({ where: { id: rootClient.id } });
      }
      if (technician) await a.technician.delete({ where: { id: technician.id } });
    } finally {
      await Promise.allSettled([a.$disconnect(), b.$disconnect()]);
      if (scratch) await rm(scratch, { recursive: true, force: true });
    }
  });

  // Read-only guard queries are the ONLY operations before sentinel validation.
  const [identity] = await a.$queryRaw`SELECT current_database() AS db, current_user AS usr,
    current_setting('server_version_num') AS version, inet_server_addr()::text AS address`;
  assert.equal(identity.db, 'monitor_qa'); assert.equal(identity.usr, 'qa');
  assert.equal(Math.floor(Number(identity.version) / 10000), 17);
  assert.match(identity.address, /^10\.77\.18\./);
  const guard = await a.$queryRaw`SELECT purpose FROM public.command_recovery_qa_sentinel WHERE id = 1`;
  assert.equal(guard.length, 1); assert.equal(guard[0].purpose, sentinel);

  const { NodeCommandsService } = appRequire('/app/dist/node-commands/node-commands.service.js');
  const { CommandOrchestratorService } = appRequire('/app/dist/commands/command-orchestrator.service.js');
  const { TechnicianBackupFollowUpService } = appRequire('/app/dist/technicians/technician-backup-followup.service.js');
  const { TechniciansService } = appRequire('/app/dist/technicians/technicians.service.js');
  const { BackupsCommandService } = appRequire('/app/dist/backups/backups-command.service.js');
  const { BackupsIngestService } = appRequire('/app/dist/backups/backups-ingest.service.js');
  const { BackupsStorageService } = appRequire('/app/dist/backups/backups-storage.service.js');
  const run = randomUUID();
  rootClient = await a.client.create({ data: { code: run, name: 'Synthetic durable recovery QA' } });
  const site = await a.site.create({ data: { clientId: rootClient.id, code: 'synthetic', name: 'Synthetic' } });
  technician = await a.technician.create({ data: { fullName: 'Synthetic QA', loginUsername: `qa${run.slice(0, 8)}` } });
  scratch = await mkdtemp(join(tmpdir(), 'pfs-command-recovery-'));
  const expiresAt = () => new Date(Date.now() + 3600_000);
  const makeServices = db => {
    const orchestrator = new CommandOrchestratorService(db);
    const followUp = new TechnicianBackupFollowUpService(db, orchestrator);
    return { orchestrator, followUp, service: new NodeCommandsService(db, followUp) };
  };
  const sa = makeServices(a), sb = makeServices(b);
  const fixture = async (data = {}, version = '0.5.26') => {
    const node = await a.node.create({ data: { siteId: site.id, nodeUid: randomUUID(), hostname: 'synthetic.invalid', agentVersion: version } });
    const account = await a.technicianNodeAccount.create({ data: {
      nodeId: node.id, technicianId: technician.id, pfsenseUsername: technician.loginUsername,
      privilegeProfile: 'admin_full', status: 'pending_create',
    } });
    const credential = await a.nodeCredential.create({ data: {
      nodeId: node.id, secretHint: 'synthetic', secretHash: 'synthetic-only', secretEncrypted: 'synthetic-only',
    } });
    const command = await a.nodeCommand.create({ data: {
      nodeId: node.id, type: 'local_user_set_password', expiresAt: expiresAt(),
      payloadJson: { account_id: account.id, technician_id: technician.id,
        pfsense_username: technician.loginUsername, password: 'Synthetic-only-pass!' }, ...data,
    } });
    await a.technicianNodeAccount.update({ where: { id: account.id }, data: { lastCommandId: command.id } });
    return { node, account, credential, command };
  };
  const ack = (services, f, attempt = f.command.retryCount) => services.service.acknowledgeCommand({
    nodeId: f.node.id, credentialId: run, commandId: f.command.id, status: 'running', deliveryAttempt: attempt,
  });
  const followIntent = f => ({ follow_up_technician_provision: {
    action: 'local_user_set_password', account_id: f.account.id, technician_id: technician.id,
    pfsense_username: technician.loginUsername, password: 'Synthetic-only-pass!', requested_by_user_id: run,
  } });
  const succeededBackup = async () => {
    const f = await fixture({ type: 'config_backup_now', status: 'succeeded', completedAt: new Date() });
    f.command = await a.nodeCommand.update({ where: { id: f.command.id }, data: { payloadJson: followIntent(f) } });
    return f;
  };
  const assertChild = async f => {
    const parent = await a.nodeCommand.findUnique({ where: { id: f.command.id } });
    const children = await a.nodeCommand.findMany({ where: { nodeId: f.node.id, type: 'local_user_set_password' } });
    assert.equal(children.length, 1);
    assert.equal(parent.payloadJson.follow_up_state, 'enqueued');
    assert.equal(parent.payloadJson.follow_up_command_id, children[0].id);
    assert.equal(parent.payloadJson.follow_up_technician_provision, undefined);
    assert.equal((await a.technicianNodeAccount.findUnique({ where: { id: f.account.id } })).lastCommandId, children[0].id);
    assert.equal(await a.auditLog.count({ where: { targetId: children[0].id, action: 'technician.provision_after_backup' } }), 1);
    return children[0];
  };
  const waitBlocked = async label => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await b.$queryRaw`SELECT pid FROM pg_stat_activity WHERE application_name = ${label} AND wait_event_type = 'Lock'`;
      if (rows.length) return;
      await delay(10);
    }
    assert.fail('expected a database lock wait before releasing the competing transaction');
  };
  const runCase = (name, work) => {
    if (selectedCase === 'disconnect' && !name.startsWith('server terminates')) return Promise.resolve();
    return t.test(name, work);
  };

  await runCase('two independent running ACKs grant execution once and scrub once', async () => {
    const f = await fixture();
    const responses = await Promise.all([ack(sa, f), ack(sb, f)]);
    assert.equal(responses.filter(x => x.execute === true).length, 1);
    assert.ok(responses.every(x => x.delivery_attempt === 0));
    const current = await a.nodeCommand.findUnique({ where: { id: f.command.id } });
    assert.equal(current.status, 'running'); assert.equal(current.payloadJson.password, undefined);
    assert.equal(await a.auditLog.count({ where: { targetId: current.id } }), 1);
  });

  for (const method of ['acknowledgeCommand', 'reportCommandResult']) {
    await runCase(`${method}: old attempt blocked on a row lock cannot mutate the next attempt`, async () => {
      const f = await fixture({ type: 'table_search', payloadJson: { ip: '192.0.2.1' } });
      const ready = deferred(), release = deferred();
      const label = `qa-recovery-${randomUUID()}`;
      const tagged = makeServices(txProxy(b, async tx => {
        await tx.$queryRaw`SELECT set_config('application_name', ${label}, true)`;
        return tx;
      }));
      const writer = a.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM node_commands WHERE id = ${f.command.id}::uuid FOR UPDATE`;
        ready.resolve(); await release.promise;
        await tx.nodeCommand.update({ where: { id: f.command.id }, data: { retryCount: 1, status: 'pending' } });
      }, { timeout: 15_000 });
      await ready.promise;
      const outcome = tagged.service[method]({ nodeId: f.node.id, credentialId: run,
        commandId: f.command.id, deliveryAttempt: 0, status: method === 'acknowledgeCommand' ? 'running' : 'succeeded',
      }).then(value => ({ value }), error => ({ error }));
      try { await waitBlocked(label); } finally { release.resolve(); }
      await writer;
      assert.match((await outcome).error?.message ?? '', /does not match/);
      const current = await a.nodeCommand.findUnique({ where: { id: f.command.id } });
      assert.equal(current.retryCount, 1); assert.equal(current.status, 'pending');
      assert.equal(await a.auditLog.count({ where: { targetId: current.id } }), 0);
    });
  }

  await runCase('follow-up failure after enqueue rolls back child, account, scrub and audit', async () => {
    const f = await succeededBackup();
    const failing = makeServices(txProxy(a, async tx => new Proxy(tx, { get(target, property) {
      if (property === 'auditLog') return { ...target.auditLog, create: async input => {
        if (input.data.action === 'technician.provision_after_backup') throw new Error('synthetic worker interruption');
        return target.auditLog.create(input);
      } };
      return Reflect.get(target, property);
    } })));
    await assert.rejects(failing.followUp.processAfterBackupSuccess(f.command), /worker interruption/);
    assert.deepEqual((await b.nodeCommand.findUnique({ where: { id: f.command.id } })).payloadJson, followIntent(f));
    assert.equal(await b.nodeCommand.count({ where: { nodeId: f.node.id } }), 1);
    assert.equal((await b.technicianNodeAccount.findUnique({ where: { id: f.account.id } })).lastCommandId, f.command.id);
    await makeServices(b).followUp.reconcileStuckSucceededBackups();
    await assertChild(f);
  });

  await runCase('server terminates an in-flight worker connection: PostgreSQL rolls back and restart recovers', async () => {
    const f = await succeededBackup();
    let terminationObserved = false;
    const orchestrator = new CommandOrchestratorService(a);
    const realEnqueue = orchestrator.enqueueCommand.bind(orchestrator);
    orchestrator.enqueueCommand = async (input, tx) => {
      await realEnqueue(input, tx);
      const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      const [{ stopped }] = await b.$queryRaw`SELECT pg_terminate_backend(${pid}::int) AS stopped`;
      terminationObserved = stopped === true;
      throw new Error('synthetic worker connection terminated');
    };
    await assert.rejects(new TechnicianBackupFollowUpService(a, orchestrator).processAfterBackupSuccess(f.command));
    assert.equal(terminationObserved, true, 'PostgreSQL must actually terminate the worker connection');
    assert.equal(await b.nodeCommand.count({ where: { nodeId: f.node.id } }), 1);
    assert.deepEqual((await b.nodeCommand.findUnique({ where: { id: f.command.id } })).payloadJson, followIntent(f));
    // The killed connection belongs to pool a. Restart that pool explicitly;
    // assertions must observe recovery through a fresh connection, not a stale
    // engine connection left over from the intentionally terminated worker.
    await a.$disconnect();
    await a.$connect();
    await makeServices(a).followUp.reconcileStuckSucceededBackups();
    await assertChild(f);
  });

  await runCase('two follow-up dispatchers serialize; terminal child and lost reply never dispatch twice', async () => {
    const f = await succeededBackup();
    await Promise.all([sa.followUp.processAfterBackupSuccess(f.command), sb.followUp.processAfterBackupSuccess(f.command)]);
    const child = await assertChild(f);
    await a.nodeCommand.update({ where: { id: child.id }, data: { status: 'succeeded', completedAt: new Date() } });
    await makeServices(b).followUp.processAfterBackupSuccess(f.command);
    await assertChild(f);
  });

  await runCase('initial backup ownership is atomic for visibility and rejection rollback', async () => {
    for (const rejectLink of [false, true]) {
      const f = await fixture({ type: 'config_backup_now', status: 'cancelled' });
      await a.technicianNodeAccount.update({ where: { id: f.account.id }, data: { lastCommandId: null } });
      const ready = deferred(), release = deferred();
      const db = txProxy(a, async tx => new Proxy(tx, { get(target, property) {
        if (property === 'technicianNodeAccount') return { ...target.technicianNodeAccount, update: async input => {
          ready.resolve(); await release.promise;
          if (rejectLink) throw new Error('synthetic ownership rejected');
          return target.technicianNodeAccount.update(input);
        } };
        return Reflect.get(target, property);
      } }));
      const technicians = new TechniciansService(db, new CommandOrchestratorService(db), {});
      technicians.findVisibleTechnician = async () => technician;
      technicians.planBatchProvision = async () => ({ skipped: [], createNodeIds: [], resetNodeIds: [],
        createPayloadByNode: {}, resetPayloadByNode: {}, nodeById: new Map([[f.node.id, f.node]]),
        backupQueue: [{ node_id: f.node.id, follow_up: followIntent(f).follow_up_technician_provision }],
      });
      const pending = technicians.createBatchProvision(run, { technician_id: technician.id,
        node_ids: [f.node.id], password: 'Synthetic-only-pass!' }, {});
      await ready.promise;
      try {
        assert.equal(await b.nodeCommand.count({ where: { nodeId: f.node.id, status: 'pending' } }), 0);
        assert.equal((await b.technicianNodeAccount.findUnique({ where: { id: f.account.id } })).lastCommandId, null);
      } finally { release.resolve(); }
      const output = await pending;
      assert.equal(output.summary[rejectLink ? 'failed' : 'backup_queued'], 1);
      const queued = await b.nodeCommand.findMany({ where: { nodeId: f.node.id, status: 'pending' } });
      assert.equal(queued.length, rejectLink ? 0 : 1);
      if (!rejectLink) {
        assert.equal((await b.technicianNodeAccount.findUnique({ where: { id: f.account.id } })).lastCommandId, queued[0].id);
        await a.nodeCommand.update({ where: { id: queued[0].id }, data: { status: 'succeeded' } });
        await sb.followUp.processAfterBackupSuccess(queued[0]);
        await assertChild({ ...f, command: queued[0] });
      }
    }
  });

  const upload = (db, f) => {
    const services = makeServices(db);
    const storage = new BackupsStorageService();
    const base = join(scratch, `${f.node.id}.enc`);
    storage.buildStoragePath = () => ({ absolutePath: base, relativePath: `${f.node.id}.enc` });
    const ingest = new BackupsIngestService(db, { authenticateNodeRequest: async () => ({
      headerNodeUid: f.node.nodeUid, node: f.node, credential: f.credential,
    }) }, storage, { enforceRetention: async () => {} }, new BackupsCommandService(db, services.service), { evaluateStoredBackup: async () => {} });
    ingest.logger.log = () => {}; ingest.logger.warn = () => {};
    const bytes = Buffer.from('<pfsense><synthetic>qa-only</synthetic></pfsense>');
    return { ingest, storage, bytes, base, request: {
      rawBody: bytes, headerCommandId: f.command.id, headerCommandDeliveryAttempt: String(f.command.retryCount),
      headerBackupId: randomUUID(), headerConfigSha256: storage.sha256Hex(bytes), headerConfigSize: String(bytes.length),
    } };
  };

  await runCase('stale backup upload attempt is rejected before any real file or backup row', async () => {
    const f = await fixture({ type: 'config_backup_now', status: 'running', retryCount: 1, payloadJson: {} });
    const u = upload(a, f);
    await assert.rejects(u.ingest.ingestConfigBackup({ ...u.request, headerCommandDeliveryAttempt: '0' }), /does not match/);
    assert.equal(await b.nodeConfigBackup.count({ where: { commandId: f.command.id } }), 0);
    assert.equal((await readdir(scratch)).filter(name => name.startsWith(f.node.id)).length, 0);
  });

});
