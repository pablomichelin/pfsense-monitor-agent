/**
 * Opt-in, synthetic PostgreSQL integration; requires the current Prisma migrations.
 * Run after compiling apps/api:
 *   STABILIZATION_DATABASE_URL=<disposable PG17 monitor_stabilization URL> \
 *     node --test test/admin-node-delete.integration.test.mjs
 * Never falls back to DATABASE_URL. No Docker/SSH/migrations are run by this file.
 * Fixtures and audit rows have unique IDs; cleanup never truncates shared tables.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { makeAdmin, PrismaClient, deferred } from './admin-node-delete.test-support.mjs';

const rawUrl = process.env.STABILIZATION_DATABASE_URL;
let url;
if (rawUrl) {
  url = new URL(rawUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL URL required');
  assert.equal(decodeURIComponent(url.pathname), '/monitor_stabilization', 'Only disposable monitor_stabilization is allowed');
  assert.ok(!url.searchParams.has('options'), 'Connection options are not allowed in the test URL');
  assert.ok(!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public', 'Use the migrated public test schema');
  url.searchParams.set('connection_limit', '6');
  url.searchParams.set('connect_timeout', '5');
}
const optIn = { skip: !url ? 'Set STABILIZATION_DATABASE_URL to disposable PG17 monitor_stabilization' : false, timeout: 20000 };
const txOptions = { timeout: 12000, maxWait: 5000 };

async function fixture(t, count = 1) {
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const run = `admin-node-delete-${randomUUID()}`;
  const clientId = randomUUID();
  const siteId = randomUUID();
  const technicianId = randomUUID();
  const tasks = [];
  const gates = [];
  let invalidations = 0;
  t.after(async () => {
    for (const gate of gates) gate.resolve();
    await Promise.allSettled(tasks);
    try {
      await db.auditLog.deleteMany({ where: { actorId: run } });
      await db.client.deleteMany({ where: { id: clientId } });
      await db.technician.deleteMany({ where: { id: technicianId } });
    } finally {
      await db.$disconnect();
    }
  });
  const [version] = await db.$queryRaw`SELECT current_setting('server_version_num')::int AS version`;
  assert.ok(version.version >= 170000 && version.version < 180000, 'Integration target must be PG17');
  await db.client.create({ data: { id: clientId, name: run, code: run } });
  await db.site.create({ data: { id: siteId, clientId, name: run, code: run } });
  await db.technician.create({ data: { id: technicianId, fullName: 'Synthetic Admin Tech', loginUsername: run } });
  const nodes = [];
  for (let i = 0; i < count; i++) {
    nodes.push(await db.node.create({ data: { siteId, nodeUid: `${run}-${i}`, hostname: `synthetic-${i}.invalid` } }));
  }
  const linkData = { technicianId, nodeId: nodes[0].id, pfsenseUsername: 'synthetic-admin-tech' };
  const gate = () => { const value = deferred(); gates.push(value); return value; };
  const track = (task) => { tasks.push(task); task.catch(() => {}); return task; };
  // Hooks gate the real service transaction; all actual SQL goes through Prisma.
  const service = ({ entered, onLocked, failAudit = false } = {}) => makeAdmin({
    $transaction: (callback, options) => db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      entered?.resolve(row.pid);
      const wrapped = new Proxy(tx, {
        get(target, key) {
          if (key === '$queryRaw') return async (...args) => {
            const value = await target.$queryRaw(...args);
            await onLocked?.();
            return value;
          };
          if (key === 'auditLog' && failAudit) return new Proxy(target.auditLog, {
            get(audit, operation) {
              if (operation === 'create') return async () => { throw new Error('synthetic final audit failure'); };
              return audit[operation];
            },
          });
          return target[key];
        },
      });
      return callback(wrapped);
    }, { ...options, ...txOptions }),
  }, { invalidate: () => { invalidations++; } });
  const invoke = (s, mode, confirm = false) => mode === 'single'
    ? s.deleteNode(nodes[0].id, run, undefined, undefined, confirm)
    : s.deleteNodesBatch(nodes.map((n) => n.id).reverse(), run, undefined, undefined, confirm);
  return { db, run, nodes, linkData, gate, track, service, invoke, invalidations: () => invalidations };
}

// Observe actual blocking rather than assuming that a timer means SQL was sent.
async function assertBlocked(db, waitingPid, blockingPid) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const [row] = await db.$queryRaw`
      SELECT ${blockingPid}::int = ANY(pg_blocking_pids(${waitingPid}::int)) AS blocked
    `;
    if (row.blocked) return;
    await delay(15);
  }
  assert.fail('Expected PostgreSQL row/FK lock wait was not observed');
}

async function storedBackup(t, f) {
  const dir = await mkdtemp(join(tmpdir(), 'admin-pg-backup-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'synthetic.enc');
  const bytes = Buffer.from('synthetic opaque ciphertext');
  await writeFile(path, bytes);
  const record = await f.db.nodeConfigBackup.create({ data: {
    nodeId: f.nodes[0].id, backupUid: `${f.run}-backup`, storagePath: path,
    encryptionVersion: 'aes-256-gcm:v1', configSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64),
    sizeBytes: 12, payloadSizeBytes: 12,
  } });
  return { path, bytes, record };
}

for (const mode of ['single', 'batch']) {
  test(`PG17 ${mode}: committed association preceding delete is revalidated after lock wait`, optIn, async (t) => {
    const f = await fixture(t, mode === 'batch' ? 2 : 1);
    const inserted = f.gate();
    const releaseWriter = f.gate();
    const writer = f.track(f.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      await tx.technicianNodeAccount.create({ data: f.linkData });
      inserted.resolve(row.pid);
      await releaseWriter.promise;
    }, txOptions));
    const writerPid = await inserted.promise;
    const entered = f.gate();
    const deletion = f.track(f.invoke(f.service({ entered }), mode));
    const rejected = assert.rejects(deletion, (error) => error.getStatus() === 409 && error.getResponse().code === 'technician_link');
    try {
      await assertBlocked(f.db, await entered.promise, writerPid);
    } finally {
      releaseWriter.resolve();
    }
    await writer;
    await rejected;
    assert.equal(await f.db.node.count({ where: { id: { in: f.nodes.map((n) => n.id) } } }), f.nodes.length);
    assert.equal(await f.db.technicianNodeAccount.count({ where: { nodeId: f.nodes[0].id } }), 1);
    assert.equal(await f.db.auditLog.count({ where: { actorId: f.run } }), 0);
    assert.equal(f.invalidations(), 0);
  });

  test(`PG17 ${mode}: association attempted under delete lock waits then fails FK`, optIn, async (t) => {
    const f = await fixture(t, mode === 'batch' ? 2 : 1);
    const encrypted = await storedBackup(t, f);
    const locked = f.gate();
    const entered = f.gate();
    const releaseDelete = f.gate();
    const deletion = f.track(f.invoke(f.service({ entered, onLocked: async () => {
      locked.resolve();
      await releaseDelete.promise;
    } }), mode));
    await locked.promise;
    const writerEntered = f.gate();
    const writer = f.track(f.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      writerEntered.resolve(row.pid);
      return tx.technicianNodeAccount.create({ data: f.linkData });
    }, txOptions));
    const rejected = assert.rejects(writer, (error) => error.code === 'P2003');
    try {
      await assertBlocked(f.db, await writerEntered.promise, await entered.promise);
    } finally {
      releaseDelete.resolve();
    }
    assert.equal((await deletion).ok, true);
    await rejected;
    assert.equal(await f.db.technicianNodeAccount.count({ where: { nodeId: f.nodes[0].id } }), 0);
    const manifest = await f.db.auditLog.findFirst({ where: { actorId: f.run, action: 'backup.config.node_delete_cleanup_pending' } });
    assert.equal(manifest.metadataJson.storage_path, encrypted.path);
    assert.equal(manifest.targetId, encrypted.record.id);
    assert.equal(manifest.metadataJson.cleanup_state, 'pending_manual_review');
    assert.deepEqual(await readFile(encrypted.path), encrypted.bytes);
  });

  test(`PG17 ${mode}: confirmed links are detached; manifest/audit survive cascade`, optIn, async (t) => {
    const f = await fixture(t, mode === 'batch' ? 2 : 1);
    const encrypted = await storedBackup(t, f);
    await f.db.technicianNodeAccount.create({ data: f.linkData });
    const result = await f.invoke(f.service(), mode, true);
    assert.equal(result.ok, true);
    assert.equal(await f.db.node.count({ where: { id: { in: f.nodes.map((n) => n.id) } } }), 0);
    assert.equal(await f.db.nodeConfigBackup.count({ where: { id: encrypted.record.id } }), 0);
    assert.equal(await f.db.auditLog.count({ where: { actorId: f.run } }), 2);
    assert.equal(f.invalidations(), 1);
    assert.deepEqual(await readFile(encrypted.path), encrypted.bytes);
  });

  test(`PG17 ${mode}: final audit failure rolls back nodes, links, metadata and manifest`, optIn, async (t) => {
    const f = await fixture(t, mode === 'batch' ? 2 : 1);
    const encrypted = await storedBackup(t, f);
    await f.db.technicianNodeAccount.create({ data: f.linkData });
    await assert.rejects(f.invoke(f.service({ failAudit: true }), mode, true), /synthetic final audit failure/);
    assert.equal(await f.db.node.count({ where: { id: { in: f.nodes.map((n) => n.id) } } }), f.nodes.length);
    assert.equal(await f.db.technicianNodeAccount.count({ where: { nodeId: f.nodes[0].id } }), 1);
    assert.equal(await f.db.nodeConfigBackup.count({ where: { id: encrypted.record.id } }), 1);
    assert.equal(await f.db.auditLog.count({ where: { actorId: f.run } }), 0);
    assert.equal(f.invalidations(), 0);
    assert.deepEqual(await readFile(encrypted.path), encrypted.bytes);
  });
}
