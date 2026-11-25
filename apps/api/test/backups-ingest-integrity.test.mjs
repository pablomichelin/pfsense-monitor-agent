import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const loadTs = require.extensions['.ts'];
let BackupsIngestService;
let BackupsCommandService;
let RecoveryIngestController;

try {
  // Load the services in memory. Storage and the database are test doubles.
  require.extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    });
    module._compile(outputText, filename);
  };
  ({ BackupsIngestService } = require('../src/backups/backups-ingest.service.ts'));
  ({ BackupsCommandService } = require('../src/backups/backups-command.service.ts'));
  ({ RecoveryIngestController } = require('../src/operational-actions/recovery-ingest.controller.ts'));
} finally {
  if (loadTs) require.extensions['.ts'] = loadTs;
  else delete require.extensions['.ts'];
}

const xml = Buffer.from('<pfsense><hostname>synthetic</hostname></pfsense>');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nodeId = randomUUID();
const commandId = randomUUID();
const artifactUid = 'cfgb_20261124T100000Z_fixture';
const xmlSha256 = sha256(xml);

function request(rawBody = xml) {
  return {
    rawBody,
    headerConfigSha256: xmlSha256,
    headerConfigSize: String(xml.byteLength),
    headerBackupId: randomUUID(),
  };
}

function existingArtifact() {
  return {
    id: randomUUID(),
    nodeId,
    commandId: null,
    attemptId: randomUUID(),
    status: 'stored',
    backupUid: artifactUid,
    configSha256: xmlSha256,
    receivedAt: new Date(),
    metadataJson: null,
  };
}

function fixture({
  rows: initialRows = [], version = '0.5.25', failure, onWrite, beforeLock,
} = {}) {
  const rows = [...initialRows];
  const writes = [];
  const audits = [];
  const commandResults = [];
  const credentialTouches = [];
  const originalPath = '/synthetic-only/artifact.enc';
  const files = new Map([[originalPath, 'previous-ciphertext']]);
  const postProcessing = [];
  const recovery = { recoverySeenAt: null, reads: 0 };
  let failAt = failure;
  let lookupUnavailable = false;
  let lockQueue = Promise.resolve();
  let lockHeld = false;

  const fail = (step) => {
    if (step !== failAt) return;
    failAt = undefined;
    throw new Error('synthetic ' + step);
  };

  const db = {
    $transaction: async (work) => {
      let release;
      let before;
      let committed = false;
      const tx = {
        ...db,
        $queryRaw: async (query, id) => {
          assert.equal(id, nodeId);
          assert.match(query.join('?'), /FROM nodes WHERE id = \?::uuid FOR UPDATE/);
          const previous = lockQueue;
          ({ promise: lockQueue, resolve: release } = Promise.withResolvers());
          await previous;
          lockHeld = true;
          beforeLock?.(rows);
          before = { rows: [...rows], audits: audits.length, touches: credentialTouches.length };
          return [{ configBackupPolicyJson: null }];
        },
      };
      try {
        const result = await work(tx);
        if (failAt === 'commit-aborted') fail('commit-aborted');
        committed = true;
        if (failAt === 'commit-read-unavailable') {
          lookupUnavailable = true;
          fail('commit-read-unavailable');
        }
        fail('commit-reply-lost');
        return result;
      } catch (error) {
        if (!committed && before) {
          rows.splice(0, rows.length, ...before.rows);
          audits.length = before.audits;
          credentialTouches.length = before.touches;
        }
        throw error;
      } finally {
        if (release) {
          lockHeld = false;
          release();
        }
      }
    },
    nodeConfigBackup: {
      findFirst: async ({ where }) => {
        if (lookupUnavailable) {
          lookupUnavailable = false;
          throw new Error('synthetic lookup unavailable');
        }
        return rows.find((row) =>
          (where.nodeId === undefined || row.nodeId === where.nodeId) &&
          (where.id === undefined || row.id === where.id) &&
          (where.storagePath === undefined || row.storagePath === where.storagePath) &&
          (where.attemptId === undefined || row.attemptId === where.attemptId) &&
          (where.commandId === undefined || row.commandId === where.commandId) &&
          (where.configSha256 === undefined || row.configSha256 === where.configSha256) &&
          (where.receivedAt === undefined || row.receivedAt >= where.receivedAt.gte) &&
          (where.metadataJson === undefined || row.metadataJson?.delivery_attempt === where.metadataJson.equals) &&
          (where.status === undefined || (typeof where.status === 'string'
            ? row.status === where.status : where.status.in.includes(row.status)))
        ) ?? null;
      },
      create: async ({ data }) => {
        fail('metadata');
        const row = { id: randomUUID(), ...data };
        rows.unshift(row);
        return row;
      },
    },
    node: {
      update: async ({ where, data }) => {
        assert.equal(where.id, nodeId);
        await lockQueue;
        Object.assign(recovery, data);
      },
    },
    nodeCredential: { update: async (input) => { credentialTouches.push(input); } },
    auditLog: { create: async ({ data }) => {
      fail('audit');
      audits.push(data);
    } },
  };
  const storage = {
    sha256Hex: sha256,
    buildStoragePath: () => ({
      absolutePath: originalPath,
      relativePath: 'artifact.enc',
    }),
    encryptToFile: async (bytes, path) => {
      writes.push({ bytes, path });
      files.set(path, 'new-ciphertext');
      await onWrite?.({ path, count: writes.length, lockHeld });
      fail('encryption');
    },
    removeFile: async (path) => { files.delete(path); },
  };
  const auth = { authenticateNodeRequest: async () => ({
    headerNodeUid: 'synthetic-node', node: { id: nodeId, agentVersion: version },
    credential: { id: randomUUID() },
  }) };
  const poll = new RecoveryIngestController(auth, db, {
    getPendingCommandsForNode: async (id, channel) => {
      assert.equal(id, nodeId);
      assert.equal(channel, 'supervisor_v1');
      assert.ok(recovery.recoverySeenAt);
      recovery.reads++;
      return [];
    },
  });
  const ingest = new BackupsIngestService(
    db,
    auth,
    storage,
    { enforceRetention: async () => {
      postProcessing.push('retention');
      fail('retention');
      return [];
    } },
    {
      withBackupDeliveryAttempt: async (_input, work, onReturned) => db.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT id FROM nodes WHERE id = ${nodeId}::uuid FOR UPDATE`;
        const result = await work(tx);
        onReturned?.();
        return result;
      }),
      markCommandSucceeded: async (input) => { commandResults.push(input); },
    },
    { evaluateStoredBackup: async () => { postProcessing.push('drift'); } },
  );
  return {
    ingest, rows, writes, audits, commandResults, credentialTouches,
    files, originalPath, postProcessing, recovery,
    failNextCommit: (failure) => { failAt = failure; },
    pollRecovery: () => poll.poll({ version: '0.5.30' }, { rawBody: Buffer.from('{"version":"0.5.30"}') }),
  };
}

test('scheduled backup validates declared size before accepting unchanged content', async () => {
  const { ingest, rows, writes, credentialTouches } = fixture({ rows: [existingArtifact()] });
  const upload = { ...request(), headerConfigSize: String(xml.byteLength + 1) };
  await assert.rejects(ingest.ingestConfigBackup(upload), /X-Config-Size does not match payload/);
  assert.equal(rows.length, 1);
  assert.equal(writes.length, 0);
  assert.equal(credentialTouches.length, 0);
});

test('scheduled stored retry and new unchanged upload keep their distinct receipts', async () => {
  const { ingest, rows, writes, audits } = fixture();
  const upload = request();
  const initial = await ingest.ingestConfigBackup(upload);
  const retry = await ingest.ingestConfigBackup(upload);
  assert.equal(initial.stored, true);
  assert.equal(retry.backup_id, initial.backup_id);
  assert.equal(retry.stored, true);
  assert.equal(retry.duplicate, false);
  assert.equal(retry.sha256, initial.sha256);

  const unchanged = await ingest.ingestConfigBackup(request());
  assert.equal(unchanged.backup_id, initial.backup_id);
  assert.equal(unchanged.stored, false);
  assert.equal(unchanged.duplicate, true);
  assert.equal(rows.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(rows[0].payloadSha256, xmlSha256);
});

test('scheduled gzip upload hashes the original XML and the compressed payload independently', async () => {
  const { ingest, rows, writes } = fixture();
  const compressed = gzipSync(xml);
  const upload = { ...request(compressed), contentType: 'application/gzip' };
  const stored = await ingest.ingestConfigBackup(upload);
  assert.equal(stored.stored, true);
  assert.deepEqual(writes[0].bytes, xml);
  assert.equal(rows[0].configSha256, xmlSha256);
  assert.equal(rows[0].payloadSha256, sha256(compressed));

  const unchanged = await ingest.ingestConfigBackup({
    ...upload, headerBackupId: randomUUID(),
  });
  assert.equal(unchanged.duplicate, true);
  assert.equal(unchanged.backup_id, stored.backup_id);
  assert.equal(rows.length, 1);
  assert.equal(writes.length, 1);
});

for (const failure of ['metadata', 'audit']) {
  test('scheduled rollback after ' + failure + ' failure removes only its own file', async () => {
    const f = fixture({ failure });
    const upload = request();

    await assert.rejects(f.ingest.ingestConfigBackup(upload), new RegExp('synthetic ' + failure));
    assert.equal(f.rows.length, 0);
    assert.equal(f.audits.length, 0);
    assert.deepEqual([...f.files], [[f.originalPath, 'previous-ciphertext']]);
    assert.deepEqual(f.postProcessing, []);

    const retry = await f.ingest.ingestConfigBackup(upload);
    assert.equal(f.rows.length, 1);
    assert.equal(f.audits.length, 1);
    assert.equal(retry.backup_id, f.rows[0].backupUid);
    assert.match(retry.backup_id, /^cfgb_\d{8}T\d{6}Z_[0-9a-f]{8}$/);
    assert.notEqual(f.writes[0].path, f.writes[1].path);
    assert.match(f.writes[1].path, /\.[0-9a-f-]{36}\.enc$/);
    assert.deepEqual([...f.files.keys()], [f.originalPath, f.rows[0].storagePath]);
    assert.deepEqual(f.postProcessing, ['retention', 'drift']);
  });
}

test('scheduled encryption failure keeps its audit after rollback', async () => {
  const f = fixture({ failure: 'encryption' });
  await assert.rejects(f.ingest.ingestConfigBackup(request()), /synthetic encryption/);
  assert.equal(f.rows.length, 0);
  assert.deepEqual(f.audits.map((entry) => entry.action), ['backup.config.failure']);
  assert.deepEqual([...f.files], [[f.originalPath, 'previous-ciphertext']]);
  assert.deepEqual(f.postProcessing, []);
});

for (const failure of ['commit-reply-lost', 'commit-read-unavailable', 'commit-aborted']) {
  test('scheduled commit recovery with ' + failure + ' preserves ciphertext and avoids false success', async () => {
    const f = fixture({ failure });
    const upload = request();
    if (failure === 'commit-reply-lost') {
      assert.equal((await f.ingest.ingestConfigBackup(upload)).backup_id, f.rows[0].backupUid);
    } else {
      await assert.rejects(f.ingest.ingestConfigBackup(upload), new RegExp('synthetic ' + failure));
    }

    assert.ok(f.files.has(f.writes[0].path));
    assert.equal(f.rows.length, failure === 'commit-aborted' ? 0 : 1);
    const retry = await f.ingest.ingestConfigBackup(upload);
    assert.equal(retry.backup_id, f.rows[0].backupUid);
    assert.equal(f.writes.length, failure === 'commit-aborted' ? 2 : 1);
    assert.equal(f.audits.length, 1);
    assert.equal(f.files.get(f.originalPath), 'previous-ciphertext');
    assert.deepEqual(f.postProcessing, failure === 'commit-read-unavailable' ? [] : ['retention', 'drift']);
  });
}

test('scheduled staging leaves the node free for recovery update and command lookup', { timeout: 3_000 }, async () => {
  const wrote = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const f = fixture({
    onWrite: async ({ lockHeld }) => {
      assert.equal(lockHeld, false);
      wrote.resolve();
      await resume.promise;
    },
  });
  const pending = f.ingest.ingestConfigBackup(request());
  try {
    await Promise.race([wrote.promise, pending]);
    assert.equal(f.rows.length, 0);
    assert.deepEqual(await f.pollRecovery(), { commands: [] });
    assert.equal(f.recovery.reads, 1);
    assert.ok(f.recovery.recoverySeenAt instanceof Date);
    assert.equal(f.rows.length, 0);
  } finally {
    resume.resolve();
    await pending;
  }
  assert.equal(f.rows.length, 1);
});

test('concurrent scheduled staging publishes one artifact and cleans the other', { timeout: 3_000 }, async () => {
  const firstStaged = Promise.withResolvers();
  const secondStaged = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const f = fixture({
    onWrite: async ({ count, lockHeld }) => {
      assert.equal(lockHeld, false);
      (count === 1 ? firstStaged : secondStaged).resolve();
      await resume.promise;
    },
  });
  const upload = request();
  const first = f.ingest.ingestConfigBackup(upload);
  let second;
  try {
    await Promise.race([firstStaged.promise, first]);
    second = f.ingest.ingestConfigBackup(upload);
    await Promise.race([secondStaged.promise, second]);
    assert.equal(f.writes.length, 2);
    assert.equal(f.rows.length, 0);
    assert.equal(f.files.size, 3);
    resume.resolve();

    const receipts = await Promise.all([first, second]);
    for (const receipt of receipts) {
      assert.equal(receipt.backup_id, f.rows[0].backupUid);
      assert.equal(receipt.sha256, xmlSha256);
      assert.equal(receipt.stored, true);
      assert.equal(receipt.duplicate, false);
    }
    assert.equal(f.rows.length, 1);
    assert.equal(f.writes.length, 2);
    assert.deepEqual([...f.files.keys()], [f.originalPath, f.rows[0].storagePath]);
    assert.equal(f.audits.length, 1);
    assert.deepEqual(f.postProcessing, ['retention', 'drift']);
    assert.equal(f.ingest.scheduledDuplicateFlood.has(nodeId), false);
  } finally {
    resume.resolve();
    await Promise.allSettled([first, second]);
  }
});

for (const failure of [undefined, 'commit-reply-lost', 'commit-read-unavailable']) {
  test('scheduled staging loses to a manual backup and counts one duplicate after ' + (failure ?? 'commit'), {
    timeout: 3_000,
  }, async () => {
    const wrote = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const f = fixture({
      version: '0.5.26',
      onWrite: async ({ count, lockHeld }) => {
        if (count !== 1) return;
        assert.equal(lockHeld, false);
        wrote.resolve();
        await resume.promise;
      },
    });
    const bucket = { count: 29, windowStart: Date.now(), warned: false };
    f.ingest.scheduledDuplicateFlood.set(nodeId, bucket);
    const warnings = [];
    f.ingest.logger.warn = (message) => {
      assert.equal(f.files.has(f.writes[0].path), false);
      warnings.push(message);
    };

    const upload = request();
    const pending = f.ingest.ingestConfigBackup(upload);
    let manual;
    try {
      await Promise.race([wrote.promise, pending]);
      manual = await f.ingest.ingestConfigBackup({
        ...request(), headerCommandId: commandId, headerCommandDeliveryAttempt: '1',
      });
      assert.equal(f.rows.length, 1);
      assert.equal(f.rows[0].commandId, commandId);
      assert.equal(bucket.count, 29);
      if (failure) f.failNextCommit(failure);
    } finally {
      resume.resolve();
    }

    let scheduled;
    if (failure === 'commit-read-unavailable') {
      await assert.rejects(pending, /synthetic commit-read-unavailable/);
      assert.equal(bucket.count, 29);
      assert.deepEqual(warnings, []);
      assert.equal(f.files.has(f.writes[0].path), false);
      scheduled = await f.ingest.ingestConfigBackup(upload);
    } else {
      scheduled = await pending;
    }

    assert.equal(scheduled.backup_id, manual.backup_id);
    assert.equal(scheduled.stored, false);
    assert.equal(scheduled.duplicate, true);
    assert.equal(f.rows.length, 1);
    assert.equal(f.audits.length, 1);
    assert.deepEqual([...f.files.keys()], [f.originalPath, f.rows[0].storagePath]);
    assert.deepEqual(f.postProcessing, ['retention', 'drift']);
    assert.equal(f.writes.length, 2);
    assert.equal(bucket.count, 30);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /scheduled duplicate flood .*count=30\/h/);
  });
}

test('scheduled rechecks a preliminary duplicate and stages outside the lock if latest changed', async () => {
  const previous = existingArtifact();
  const newerManual = {
    ...existingArtifact(), commandId, configSha256: 'b'.repeat(64), backupUid: 'newer-manual',
  };
  let changed = false;
  const f = fixture({
    rows: [previous],
    beforeLock: (rows) => {
      if (changed) return;
      changed = true;
      rows.unshift(newerManual);
    },
    onWrite: ({ lockHeld }) => assert.equal(lockHeld, false),
  });
  const upload = request();
  const initial = await f.ingest.ingestConfigBackup(upload);
  assert.equal(initial.stored, true);
  assert.equal(f.writes.length, 1);
  assert.equal(f.rows.length, 3);
  // A prior receipt must win even when the currently latest content differs.
  f.rows.unshift(f.rows.splice(f.rows.indexOf(newerManual), 1)[0]);
  const retry = await f.ingest.ingestConfigBackup(upload);
  assert.equal(retry.backup_id, initial.backup_id);
  assert.equal(retry.duplicate, false);
  assert.equal(f.writes.length, 1);
});

test('scheduled retention failure leaves the committed file, audit and retry receipt', async () => {
  const f = fixture({ failure: 'retention' });
  const upload = request();
  await assert.rejects(f.ingest.ingestConfigBackup(upload), /synthetic retention/);
  assert.equal(f.rows.length, 1);
  assert.equal(f.audits.length, 1);
  assert.ok(f.files.has(f.rows[0].storagePath));

  assert.equal((await f.ingest.ingestConfigBackup(upload)).backup_id, f.rows[0].backupUid);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.postProcessing, ['retention']);
});

for (const version of ['0.5.25', '0.5.26']) {
  test(`manual unchanged retry keeps the artifact receipt for agent ${version}`, async () => {
    const { ingest, rows, writes, audits, commandResults } = fixture({
      rows: [existingArtifact()], version,
    });
    const upload = {
      ...request(),
      headerCommandId: commandId,
      ...(version === '0.5.26' ? { headerCommandDeliveryAttempt: '1' } : {}),
    };
    const initial = await ingest.ingestConfigBackup(upload);
    const retry = await ingest.ingestConfigBackup(upload);

    assert.equal(initial.backup_id, artifactUid);
    assert.equal(retry.backup_id, artifactUid);
    assert.equal(retry.stored, false);
    assert.equal(retry.duplicate, true);
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].backupUid, artifactUid);
    assert.equal(rows[0].metadataJson.duplicate_of, artifactUid);
    assert.equal(writes.length, 0);
    assert.equal(audits.length, 1);
    assert.deepEqual(commandResults.map((result) => result.backupUid), [artifactUid, artifactUid]);
  });
}

for (const metadataJson of [{ duplicate_of: artifactUid }, null]) {
  test(`heartbeat reconciliation handles ${metadataJson ? 'recorded artifact references' : 'old duplicate rows'}`, async () => {
    const backup = { ...existingArtifact(), status: 'duplicate', backupUid: 'legacy-duplicate', metadataJson };
    const db = {
      nodeCommand: {
        findMany: async () => [{ id: commandId, retryCount: 0, configBackups: [backup] }],
      },
    };
    const service = new BackupsCommandService(db, { supportsDurableDelivery: async () => false });
    const results = [];
    service.markCommandSucceeded = async (result) => { results.push(result); };

    await service.reconcileSucceededCommands(nodeId);
    assert.equal(results.length, 1);
    assert.equal(results[0].backupUid, metadataJson ? artifactUid : backup.backupUid);
    assert.equal(results[0].duplicate, true);
  });
}
