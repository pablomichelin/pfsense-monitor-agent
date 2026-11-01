import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeAdmin, Prisma } from './admin-node-delete.test-support.mjs';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const missing = '00000000-0000-4000-8000-000000000003';
const node = (id) => ({ id, nodeUid: `uid-${id}`, hostname: `host-${id}`, displayName: null });
const account = (nodeId, fullName = 'Test Tech', loginUsername = 'testtech') => ({
  nodeId, technician: { fullName, loginUsername },
});
const backup = (id, nodeId, storagePath = '/synthetic/backup.enc') => ({
  id, nodeId, backupUid: `backup-${id}`, storagePath, encryptionVersion: 'aes-256-gcm:v1',
  configSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), sizeBytes: 12,
  payloadSizeBytes: 12, compression: null, receivedAt: new Date('2026-10-31T00:00:00Z'),
});

function harness({ nodes = [node(A)], accounts = [], backups = [], onLock, fail } = {}) {
  const h = { state: { nodes, accounts, backups, audits: [] }, events: [], invalidations: 0 };
  const forbidden = () => { throw new Error('preflight DB read outside transaction'); };
  const prisma = {
    node: { findUnique: forbidden, findMany: forbidden },
    technicianNodeAccount: { findMany: forbidden },
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, 'ReadCommitted');
      h.events.push('begin');
      let staged;
      let locked = false;
      const check = (event) => {
        assert.ok(locked, `${event} must follow node lock`);
        h.events.push(event);
        if (fail === event) throw new Error(`injected ${event}`);
      };
      const idsOf = (where) => typeof where.nodeId === 'string' ? [where.nodeId] : where.nodeId.in;
      const tx = {
        async $queryRaw(sql) {
          h.events.push('lock');
          assert.match(sql.text, /ORDER BY "id" FOR UPDATE/);
          assert.doesNotMatch(sql.text, /NO KEY UPDATE/);
          assert.ok(sql.values.every((id) => !sql.text.includes(id)));
          if (onLock) await onLock(h.state);
          staged = structuredClone(h.state);
          locked = true;
          return [];
        },
        node: {
          async findUnique({ where }) { check('read-node'); return staged.nodes.find((n) => n.id === where.id) ?? null; },
          async findMany({ where }) { check('read-nodes'); return staged.nodes.filter((n) => where.id.in.includes(n.id)); },
          async delete({ where }) { check('delete'); removeNodes([where.id]); },
          async deleteMany({ where }) { check('delete'); removeNodes(where.id.in); },
        },
        technicianNodeAccount: {
          async findMany({ where }) { check('read-links'); return staged.accounts.filter((a) => idsOf(where).includes(a.nodeId)); },
          async deleteMany({ where }) { check('detach'); staged.accounts = staged.accounts.filter((a) => !idsOf(where).includes(a.nodeId)); },
        },
        nodeConfigBackup: {
          async findMany({ where }) {
            check('read-backups');
            assert.deepEqual(where.storagePath, { not: null });
            return staged.backups.filter((b) => idsOf(where).includes(b.nodeId) && b.storagePath !== null);
          },
        },
        auditLog: {
          async createMany({ data }) { check('manifest'); staged.audits.push(...data); },
          async create({ data }) { check('audit'); staged.audits.push(data); },
        },
      };
      function removeNodes(ids) {
        staged.nodes = staged.nodes.filter((n) => !ids.includes(n.id));
        staged.accounts = staged.accounts.filter((a) => !ids.includes(a.nodeId));
        staged.backups = staged.backups.filter((b) => !ids.includes(b.nodeId));
      }
      try {
        const value = await callback(tx);
        h.state = staged;
        h.events.push('commit');
        return value;
      } catch (error) {
        h.events.push('rollback');
        throw error;
      }
    },
  };
  h.service = makeAdmin(prisma, { invalidate: () => { h.invalidations++; } });
  return h;
}

const isTechConflict = (error) => {
  assert.equal(error.getStatus(), 409);
  assert.equal(error.getResponse().code, 'technician_link');
  assert.match(error.getResponse().message, /Test Tech \(testtech\)/);
  assert.match(error.getResponse().message, /conta no pfSense não é apagada/);
  return true;
};

for (const mode of ['single', 'batch']) {
  const call = (h, confirmed = false) => mode === 'single'
    ? h.service.deleteNode(A, 'actor', undefined, undefined, confirmed)
    : h.service.deleteNodesBatch([B, A, A], 'actor', undefined, undefined, confirmed);

  test(`${mode}: link committed while lock waits requires current confirmation`, async () => {
    const h = harness({ nodes: [node(A), node(B)], onLock: (state) => state.accounts.push(account(A)) });
    await assert.rejects(call(h), isTechConflict);
    assert.equal(h.state.nodes.length, 2);
    assert.equal(h.state.accounts.length, 1);
    assert.equal(h.state.audits.length, 0);
    assert.equal(h.invalidations, 0);
    assert.deepEqual(h.events.slice(0, 4), ['begin', 'lock', mode === 'single' ? 'read-node' : 'read-nodes', 'read-links']);
  });

  test(`${mode}: confirmed deletion preserves manifest and ciphertext`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'admin-node-delete-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const path = join(dir, 'synthetic.enc');
    const ciphertext = Buffer.from('synthetic encrypted bytes');
    await writeFile(path, ciphertext);
    const h = harness({ nodes: [node(A), node(B)], accounts: [account(A)], backups: [backup('one', A, path), backup('null', A, null)] });
    const result = await call(h, true);
    assert.equal(result.ok, true);
    assert.equal(h.invalidations, 1);
    assert.deepEqual(await readFile(path), ciphertext);
    assert.equal(h.state.accounts.length, 0);
    assert.equal(h.state.backups.length, 0);
    const [manifest, audit] = h.state.audits;
    assert.equal(manifest.action, 'backup.config.node_delete_cleanup_pending');
    assert.equal(manifest.targetId, 'one');
    assert.equal(manifest.metadataJson.storage_path, path);
    assert.equal(manifest.metadataJson.cleanup_state, 'pending_manual_review');
    assert.equal(manifest.metadataJson.encryption_version, 'aes-256-gcm:v1');
    assert.equal(audit.metadataJson.backup_cleanup_pending_count, 1);
    assert.ok(h.events.indexOf('manifest') < h.events.indexOf('delete'));
    if (mode === 'batch') {
      assert.equal(result.deleted_count, 2);
      assert.deepEqual(result.deleted_ids, [B, A]);
      assert.deepEqual(audit.metadataJson.detached_technician_node_ids, [A]);
    } else {
      assert.equal(audit.metadataJson.detached_technicians, true);
    }
  });

  for (const failure of ['manifest', 'audit', 'delete']) {
    test(`${mode}: ${failure} failure rolls back deletion and manifest`, async () => {
      const h = harness({ nodes: [node(A), node(B)], accounts: [account(A)], backups: [backup('one', A)], fail: failure });
      await assert.rejects(call(h, true), new RegExp(`injected ${failure}`));
      assert.equal(h.state.nodes.length, 2);
      assert.equal(h.state.accounts.length, 1);
      assert.equal(h.state.backups.length, 1);
      assert.equal(h.state.audits.length, 0);
      assert.equal(h.invalidations, 0);
    });
  }
}

test('unlinked single delete keeps response and audit contract', async () => {
  const h = harness();
  const result = await h.service.deleteNode(A);
  assert.equal(result.node_uid, node(A).nodeUid);
  assert.equal(result.node_id, A);
  assert.equal(h.state.audits[0].metadataJson.detached_technicians, false);
  assert.equal(h.state.audits[0].metadataJson.backup_cleanup_pending_count, 0);
});

test('missing single/batch abort before deletion; empty batch rejects', async () => {
  for (const call of [
    (s) => s.deleteNode(missing),
    (s) => s.deleteNodesBatch([A, missing]),
  ]) {
    const h = harness();
    await assert.rejects(call(h.service), (error) => error.getStatus() === 404);
    assert.equal(h.state.nodes.length, 1);
    assert.ok(!h.events.includes('delete'));
  }
  await assert.rejects(harness().service.deleteNodesBatch([]), /at least one/);
});

test('scope denial stops both delete paths before opening transaction', async () => {
  for (const method of ['deleteNode', 'deleteNodesBatch']) {
    let started = false;
    const service = makeAdmin({ $transaction: () => { started = true; } }, {
      assertNodeAccess: async () => { throw new Error('scope denied'); },
    });
    await assert.rejects(service[method](method === 'deleteNode' ? A : [A], undefined, undefined, { userId: 'actor' }), /scope denied/);
    assert.equal(started, false);
  }
});

test('backup inventory is chunked and includes every selected node', async () => {
  const backups = Array.from({ length: 205 }, (_, i) => backup(String(i), i % 2 ? A : B));
  const h = harness({ nodes: [node(A), node(B)], backups });
  await h.service.deleteNodesBatch([A, B]);
  assert.equal(h.events.filter((e) => e === 'manifest').length, 3);
  assert.equal(h.state.audits.length, 206);
  assert.equal(h.state.audits.at(-1).metadataJson.backup_cleanup_pending_count, 205);
  assert.deepEqual(new Set(h.state.audits.slice(0, -1).map((a) => a.metadataJson.node_id)), new Set([A, B]));
});

test('legacy FK refusal still maps to conflict', async () => {
  const service = makeAdmin({ $transaction: async () => {
    throw new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'test' });
  } });
  await assert.rejects(service.deleteNode(A), (error) => error.getStatus() === 409);
});
