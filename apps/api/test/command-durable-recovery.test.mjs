import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { fixture, command, nodeId, userId } from './command-test-fixtures.mjs';

// Compile only this group's dependency graph in memory. No global build/dist,
// database, network, real command, or changes to shared compilation artifacts.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { Prisma } = require('@prisma/client');
const options = {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  experimentalDecorators: true, emitDecoratorMetadata: true,
  esModuleInterop: true, strict: true, skipLibCheck: true,
  moduleResolution: ts.ModuleResolutionKind.Node10, noEmit: true,
  types: ['node'],
};
const sources = [
  '../src/node-commands/node-commands.service.ts',
  '../src/commands/command-worker.service.ts',
  '../src/commands/command-orchestrator.service.ts',
  '../src/technicians/technician-backup-followup.service.ts',
  '../src/backups/backups-command.service.ts',
].map(path => fileURLToPath(new URL(path, import.meta.url)));
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (mod, filename) => {
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: options }).outputText, filename);
};
let NodeCommandsService, CommandOrchestratorService, CommandWorkerService, TechnicianBackupFollowUpService, BackupsCommandService, TechniciansService, BackupsIngestService, CommandAckDto, CommandResultDto;
try {
  ({ NodeCommandsService } = require(sources[0]));
  ({ CommandWorkerService } = require(sources[1]));
  ({ CommandOrchestratorService } = require(sources[2]));
  ({ TechnicianBackupFollowUpService } = require(sources[3]));
  ({ BackupsCommandService } = require(sources[4]));
  ({ TechniciansService } = require('../src/technicians/technicians.service.ts'));
  ({ BackupsIngestService } = require('../src/backups/backups-ingest.service.ts'));
  ({ CommandAckDto } = require('../src/backups/dto/command-ack.dto.ts'));
  ({ CommandResultDto } = require('../src/backups/dto/command-result.dto.ts'));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return value.every(x => matches(row, x));
    if (key === 'OR') return value.some(x => matches(row, x));
    const actual = row[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(actual);
      if ('notIn' in value) return !value.notIn.includes(actual);
      if ('path' in value) {
        const atPath = value.path.reduce((obj, part) => obj?.[part], actual);
        if ('equals' in value) return atPath === value.equals;
        assert.equal(value.not, Prisma.AnyNull);
        return atPath !== undefined && atPath !== null;
      }
      if ('equals' in value) {
        const expected = value.equals === Prisma.JsonNull ? null : value.equals;
        return JSON.stringify(actual) === JSON.stringify(expected);
      }
      return Object.entries(value).every(([op, expected]) => {
        if (op === 'gt') return actual > expected;
        if (op === 'gte') return actual >= expected;
        if (op === 'lte') return actual <= expected;
        throw new Error(`unimplemented recovery predicate ${key}.${op}`);
      });
    }
    return value instanceof Date ? actual?.getTime() === value.getTime() : actual === value;
  });
}
function recoveryFixture(rows = [], version = '0.5.26') {
  const f = fixture(rows, { rollback: true });
  f.state.node.agentVersion = version;
  // Extend only this new group's predicates; leave previously passed suites alone.
  f.db.nodeCommand.findMany = async ({ where, orderBy, take } = {}) => {
    let rows = f.state.commands.filter(row => matches(row, where));
    if (orderBy?.id) rows = rows.toSorted((a,b) => a.id.localeCompare(b.id));
    if (take) rows = rows.slice(0, take);
    return structuredClone(rows);
  };
  f.db.nodeCommand.updateMany = async ({ where, data }) => {
    if (f.hooks.beforeUpdate) await f.hooks.beforeUpdate({ where, data });
    const rows = f.state.commands.filter(row => matches(row, where));
    for (const row of rows) Object.assign(row, structuredClone(data));
    return { count: rows.length };
  };
  f.followUp = new TechnicianBackupFollowUpService(f.db, new CommandOrchestratorService(f.db));
  f.service = new NodeCommandsService(f.db, f.followUp);
  return f;
}
const ack = (f, row, status) => f.service.acknowledgeCommand({ nodeId, credentialId: userId, commandId: row.id, status, deliveryAttempt: row.retryCount });
const result = (f, row, status = 'succeeded') => f.service.reportCommandResult({ nodeId, credentialId: userId, commandId: row.id, status, deliveryAttempt: row.retryCount });
const cancel = (f, row) => new CommandOrchestratorService(f.db).cancelCommand({ nodeId, commandId: row.id, cancelledByUserId: userId });
const technicianId = '30000000-0000-4000-8000-000000000001';
const accountId = '40000000-0000-4000-8000-000000000001';
function backup(overrides = {}) {
  return command({ type: 'config_backup_now', status: 'succeeded', completedAt: new Date(), payloadJson: {
    follow_up_technician_provision: {
      action: 'local_user_set_password', technician_id: technicianId, account_id: accountId,
      pfsense_username: 'synthetic', password: 'Synthetic-only-pass!', requested_by_user_id: userId,
    },
  }, ...overrides });
}
function backupFixture(row = backup()) {
  const f = recoveryFixture([row]);
  Object.assign(f.state.account, { id: accountId, technicianId });
  return f;
}
function assertEnqueued(f, row) {
  assert.equal(f.state.commands.length, 2);
  const parent = f.state.commands.find(x => x.id === row.id);
  const child = f.state.commands.find(x => x.id !== row.id);
  assert.equal(parent.payloadJson.follow_up_state, 'enqueued');
  assert.equal(parent.payloadJson.follow_up_command_id, child.id);
  assert.equal(parent.payloadJson.follow_up_technician_provision, undefined);
  assert.equal(child.payloadJson.password, 'Synthetic-only-pass!');
  assert.equal(f.state.account.lastCommandId, child.id);
  assert.equal(f.state.audit.filter(x => x.action === 'technician.provision_after_backup').length, 1);
  return child;
}

test('targeted TypeScript graph passes semantic checking without global build', () => {
  const program = ts.createProgram(sources, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
});

test('lost picked_up response survives service restart and redelivers the SAME password', async () => {
  const row = command(); const f = recoveryFixture([row]);
  const first = await ack(f, row, 'picked_up'); // HTTP response discarded by caller
  assert.equal(first.execute, false); assert.equal(first.delivery_state, 'ready');
  f.service = new NodeCommandsService(f.db, f.followUp);
  const replay = await ack(f, row, 'picked_up');
  assert.deepEqual(replay, first); assert.equal(f.state.audit.length, 1);
  const delivered = await f.service.getPendingCommandsForNode(nodeId);
  assert.equal(delivered[0].payload.password, row.payloadJson.password);
  assert.equal(delivered[0].status, 'picked_up');
  assert.equal((await ack(f, row, 'running')).execute, true);
  assert.equal(f.state.commands[0].payloadJson.password, undefined);
  assert.deepEqual(await f.service.getPendingCommandsForNode(nodeId), []);
});

test('lost running response is indeterminate and never grants execution a second time', async () => {
  const row = command(); const f = recoveryFixture([row]);
  assert.equal((await ack(f, row, 'running')).execute, true);
  f.service = new NodeCommandsService(f.db, f.followUp);
  for (const status of ['running', 'picked_up']) {
    const response = await ack(f, row, status);
    assert.equal(response.status, 'running'); assert.equal(response.execute, false);
    assert.equal(response.recovery_required, true);
  }
  assert.equal(f.state.audit.length, 1);
  await result(f, row);
  assert.equal((await ack(f, row, 'running')).terminal, true);
  assert.equal((await ack(f, row, 'running')).execute, false);
});

test('simultaneous running ACKs grant execution exactly once', async () => {
  const row = command(); const f = recoveryFixture([row]);
  const responses = await Promise.all([ack(f, row, 'running'), ack(f, row, 'running')]);
  assert.equal(responses.filter(x => x.execute).length, 1);
  assert.equal(f.state.audit.length, 1);
});

for (const version of ['0.5.25', '0.5.24', null, 'invalid']) {
  test(`legacy/unknown ${version}: scrub at pickup, no sensitive redelivery or new protocol fields`, async () => {
    const row = command(); const f = recoveryFixture([row], version);
    const response = await ack(f, row, 'picked_up');
    assert.deepEqual(response, { ok: true, command_id: row.id, status: 'picked_up' });
    assert.equal(f.state.commands[0].payloadJson.password, undefined);
    assert.deepEqual(await f.service.getPendingCommandsForNode(nodeId), []);
    assert.deepEqual(await ack(f, row, 'picked_up'), response);
  });
}

for (const status of ['succeeded', 'failed', 'cancelled', 'expired']) {
  test(`terminal ${status}: new ACK informs; legacy rejects; both preserve winner`, async () => {
    for (const version of ['0.5.25', '0.5.26']) {
      const row = command({ status }); const f = recoveryFixture([row], version);
      if (version === '0.5.25') await assert.rejects(ack(f, row, 'running'), /active command not found/);
      else {
        const response = await ack(f, row, 'running');
        assert.equal(response.status, status); assert.equal(response.execute, false);
        assert.equal(response.terminal, true);
      }
      assert.equal(f.state.commands[0].status, status); assert.equal(f.state.audit.length, 0);
    }
  });
}

test('deadline passed before expiry worker: neither protocol grants execution', async () => {
  for (const version of ['0.5.25', '0.5.26']) {
    const row = command({ expiresAt: new Date(Date.now() - 1000) }); const f = recoveryFixture([row], version);
    if (version === '0.5.25') await assert.rejects(ack(f, row, 'running'), /expired/);
    else assert.equal((await ack(f, row, 'running')).execute, false);
    assert.equal(f.state.commands[0].status, 'pending'); assert.equal(f.state.audit.length, 0);
  }
});

test('cancellation interleaves before running CAS: new returns cancelled, legacy rejects', async () => {
  for (const version of ['0.5.25', '0.5.26']) {
    const row = command(); const f = recoveryFixture([row], version);
    f.hooks.beforeUpdate = async ({ data }) => {
      if (data.status !== 'running') return;
      delete f.hooks.beforeUpdate;
      await cancel(f, row);
    };
    if (version === '0.5.25') await assert.rejects(ack(f, row, 'running'), /active command not found/);
    else { const response = await ack(f, row, 'running'); assert.equal(response.status, 'cancelled'); assert.equal(response.execute, false); }
  }
});

test('foreign node cannot inspect or acknowledge another node command', async () => {
  const row = command({ nodeId: 'foreign' }); const f = recoveryFixture([row]);
  await assert.rejects(ack(f, row, 'running'), /command not found/);
  assert.equal(f.state.audit.length, 0);
});

for (const terminal of ['succeeded', 'failed', 'cancelled']) {
  test(`terminal ${terminal} scrubs password retained after durable pickup`, async () => {
    const row = command(); const f = recoveryFixture([row]); await ack(f, row, 'picked_up');
    if (terminal === 'cancelled') await cancel(f, row); else await result(f, row, terminal);
    assert.equal(f.state.commands[0].payloadJson.password, undefined);
    assert.equal(f.state.commands[0].status, terminal);
  });
}

test('crash between backup success commit and callback is recovered after restart', async () => {
  const row = backup({ status: 'pending' }); const f = backupFixture(row);
  f.service.handleBackupCommandSucceeded = async () => {}; // process dies after commit
  await result(f, row);
  assert.equal(f.state.commands[0].status, 'succeeded'); assert.equal(f.state.commands.length, 1);
  await new TechnicianBackupFollowUpService(f.db, new CommandOrchestratorService(f.db)).reconcileStuckSucceededBackups();
  assertEnqueued(f, row);
});

for (const point of ['before_enqueue', 'after_enqueue', 'final_ledger', 'audit']) {
  test(`crash ${point} rolls back follow-up entirely; restart creates one child`, async () => {
    const row = backup(); const f = backupFixture(row);
    let undo;
    if (point === 'before_enqueue') {
      f.hooks.beforeCreate = async () => { throw new Error('synthetic crash'); };
      undo = () => { delete f.hooks.beforeCreate; };
    } else if (point === 'after_enqueue') {
      const original = f.db.technicianNodeAccount.updateMany;
      f.db.technicianNodeAccount.updateMany = async input => {
        if (input.data.lastCommandId) throw new Error('synthetic crash');
        return original(input);
      };
      undo = () => { f.db.technicianNodeAccount.updateMany = original; };
    } else if (point === 'final_ledger') {
      const original = f.db.nodeCommand.update;
      f.db.nodeCommand.update = async input => {
        if (input.data.payloadJson?.follow_up_state === 'enqueued') throw new Error('synthetic crash');
        return original(input);
      };
      undo = () => { f.db.nodeCommand.update = original; };
    } else {
      const original = f.db.auditLog.create;
      f.db.auditLog.create = async () => { throw new Error('synthetic crash'); };
      undo = () => { f.db.auditLog.create = original; };
    }
    await assert.rejects(f.followUp.processAfterBackupSuccess(row), /synthetic crash/);
    assert.equal(f.state.commands.length, 1); assert.deepEqual(f.state.commands[0].payloadJson, row.payloadJson);
    assert.equal(f.state.audit.length, 0); assert.equal(f.state.account.lastCommandId, row.id);
    undo();
    await new TechnicianBackupFollowUpService(f.db, new CommandOrchestratorService(f.db)).reconcileStuckSucceededBackups();
    assertEnqueued(f, row);
  });
}

test('lost follow-up transaction response never duplicates an already completed child', async () => {
  const row = backup(); const f = backupFixture(row);
  await f.followUp.processAfterBackupSuccess(row);
  const child = assertEnqueued(f, row); child.status = 'succeeded';
  f.state.commands.find(x => x.id === child.id).status = 'succeeded';
  const restarted = new TechnicianBackupFollowUpService(f.db, new CommandOrchestratorService(f.db));
  await restarted.processAfterBackupSuccess(row); await restarted.reconcileStuckSucceededBackups();
  assertEnqueued(f, row);
});

test('two follow-up dispatchers race on the same durable payload: one child, one audit', async () => {
  const row = backup(); const f = backupFixture(row);
  await Promise.all([f.followUp.processAfterBackupSuccess(row), f.followUp.processAfterBackupSuccess(row)]);
  assertEnqueued(f, row);
});

for (const status of ['cancelled', 'expired', 'failed', 'pending', 'running']) {
  test(`stale succeeded callback cannot dispatch current ${status} backup`, async () => {
    const row = backup(); const f = backupFixture(row); f.state.commands[0].status = status;
    await f.followUp.processAfterBackupSuccess(row);
    assert.equal(f.state.commands.length, 1); assert.equal(f.state.commands[0].status, status);
    assert.equal(f.state.audit.length, 0);
  });
}

test('newer account command supersedes backup intent without issuing sensitive command', async () => {
  const row = backup(); const f = backupFixture(row);
  f.state.account.lastCommandId = 'newer-command'; f.state.account.status = 'active';
  await f.followUp.processAfterBackupSuccess(row);
  assert.equal(f.state.commands.length, 1); assert.equal(f.state.account.status, 'active');
  assert.equal(f.state.commands[0].payloadJson.follow_up_state, 'superseded');
  assert.equal(f.state.commands[0].payloadJson.follow_up_technician_provision, undefined);
});

test('reconciler filters intent before limiting, so 201 old successes cannot hide work', async () => {
  const row = backup(); const f = backupFixture(row);
  f.state.commands.unshift(...Array.from({length: 201}, () => backup({ payloadJson: {} })));
  await f.followUp.reconcileStuckSucceededBackups();
  assert.equal(f.state.commands.length, 203);
  assert.equal(f.state.commands.find(x => x.id === row.id).payloadJson.follow_up_state, 'enqueued');
});

test('reconciler advances past 200 failed intents, then retries them in later cycles', async () => {
  const row = backup({ id: 'ffffffff-0000-4000-8000-000000000000' }); const f = backupFixture(row);
  f.state.commands.unshift(...Array.from({length: 200}, (_, i) => backup({id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`})));
  const original = f.followUp.processAfterBackupSuccess.bind(f.followUp);
  f.followUp.processAfterBackupSuccess = async candidate => {
    if (candidate.id !== row.id) throw new Error('synthetic blocked node');
    return original(candidate);
  };
  // Suppress expected fixture diagnostics without retaining any logs.
  f.followUp.logger.warn = () => {};
  await f.followUp.reconcileStuckSucceededBackups();
  assert.equal(f.state.commands.length, 201);
  await f.followUp.reconcileStuckSucceededBackups();
  assert.equal(f.state.commands.length, 202);
});

test('backup upload winning success remains durable even when immediate dispatch is unavailable', async () => {
  const row = backup({ status: 'running' }); const f = backupFixture(row);
  f.hooks.beforeCreate = async () => { throw new Error('synthetic unavailable enqueue'); };
  f.service.logger.warn = () => {};
  const backups = new BackupsCommandService(f.db, f.service);
  await backups.markCommandSucceeded({ nodeId, commandId: row.id, duplicate: false, sha256: 'synthetic-hash' });
  assert.equal(f.state.commands[0].status, 'succeeded');
  assert.deepEqual(f.state.commands[0].payloadJson, row.payloadJson);
  delete f.hooks.beforeCreate;
  await f.followUp.reconcileStuckSucceededBackups();
  assertEnqueued(f, row);
});

test('sensitive failed execution blocks retries durably and audits the reason once', async () => {
  const row = command({ status: 'failed', runningAt: new Date(), resultJson: {}, maxRetries: 2 });
  const f = recoveryFixture([row]); const worker = new CommandWorkerService(f.db, {}, {});
  await worker.processRetries(); await worker.processRetries();
  assert.equal(f.state.commands[0].status, 'failed'); assert.equal(f.state.commands[0].retryCount, 0);
  assert.equal(f.state.commands[0].resultJson.execution_recovery_status, 'indeterminate');
  assert.equal(f.state.commands[0].resultJson.retry_blocked_reason, 'execution_intent_committed');
  assert.equal(f.state.audit.length, 1); assert.match(f.state.audit[0].action, /retry_blocked$/);
});

for (const type of ['table_search', 'config_backup_now']) {
  test(`${type}: idempotent failed execution remains eligible for configured retry`, async () => {
    const row = command({ type, status: 'failed', runningAt: new Date(), resultJson: {}, maxRetries: 1,
      expiresAt: new Date(Date.now() + 3600_000) });
    const f = recoveryFixture([row]);
    await new CommandWorkerService(f.db, {}, {}).processRetries();
    assert.equal(f.state.commands[0].status, 'pending'); assert.equal(f.state.commands[0].retryCount, 1);
  });
}

test('expiry scrubs durable picked_up local-user passwords without granting replay', async () => {
  for (const type of ['local_user_create', 'local_user_set_password']) {
    const row = command({ type }); const f = recoveryFixture([row]);
    await ack(f, row, 'picked_up');
    assert.equal(f.state.commands[0].payloadJson.password, row.payloadJson.password);
    f.state.commands[0].expiresAt = new Date(Date.now() - 1000);
    await f.service.expireStaleCommands('interval');
    assert.equal(f.state.commands[0].status, 'expired');
    assert.equal(f.state.commands[0].payloadJson.password, undefined);
    assert.equal(f.state.account.status, 'failed');
    const replay = await ack(f, row, 'running');
    assert.equal(replay.execute, false); assert.equal(replay.terminal, true);
    assert.deepEqual(await f.service.getPendingCommandsForNode(nodeId), []);
    assert.equal(f.state.audit.filter(x => x.action.endsWith('request_expired')).length, 1);
  }
});

function atomicBackupOwnershipFixture({ rejectEnqueue = false, rejectOwnership = false } = {}) {
  const intent = backup(); const f = backupFixture(intent);
  f.state.commands = rejectEnqueue ? [command({ type: 'config_backup_now', payloadJson: {} })] : [];
  f.state.account.lastCommandId = 'previous-command';
  let committed = structuredClone(f.state);
  let enqueueTx;
  let currentTx;
  let ownershipWrites = 0;
  const observerDb = { ...f.db, nodeCommand: {
    ...f.db.nodeCommand,
    findMany: async ({ where }) => structuredClone(committed.commands.filter(row => matches(row, where))),
  } };
  const observer = new NodeCommandsService(observerDb, f.followUp);
  const transaction = f.db.$transaction;
  f.db.$transaction = async fn => transaction(async () => {
    currentTx = { ...f.db, technicianNodeAccount: { ...f.db.technicianNodeAccount,
      update: async ({ where, data }) => {
        ownershipWrites++;
        assert.equal(enqueueTx, currentTx, 'enqueue and ownership must use the exact SAME transaction');
        const visible = await observer.getPendingCommandsForNode(nodeId);
        assert.equal(visible.length, 0, 'heartbeat cannot observe the unlinked command before commit');
        assert.equal(committed.account.lastCommandId, 'previous-command');
        if (rejectOwnership) throw new Error('synthetic ownership write rejection');
        assert.equal(where.id, accountId);
        Object.assign(f.state.account, data);
        return structuredClone(f.state.account);
      },
    } };
    const output = await fn(currentTx);
    committed = structuredClone(f.state);
    return output;
  });
  const orchestrator = new CommandOrchestratorService(f.db);
  const enqueue = orchestrator.enqueueCommand.bind(orchestrator);
  orchestrator.enqueueCommand = async (input, tx) => {
    assert.ok(tx, 'enqueue must not commit independently');
    enqueueTx = tx;
    return enqueue(input, tx);
  };
  const technicians = new TechniciansService(f.db, orchestrator, {});
  technicians.findVisibleTechnician = async () => ({ id: technicianId, loginUsername: 'synthetic', fullName: 'Synthetic' });
  technicians.planBatchProvision = async () => ({
    skipped: [], createNodeIds: [], resetNodeIds: [], createPayloadByNode: {}, resetPayloadByNode: {},
    backupQueue: [{ node_id: nodeId, follow_up: intent.payloadJson.follow_up_technician_provision }],
    nodeById: new Map([[nodeId, { hostname: 'synthetic.invalid' }]]),
  });
  const run = () => technicians.createBatchProvision(userId, {
    technician_id: technicianId, node_ids: [nodeId], password: 'Synthetic-only-pass!',
  }, {});
  return { ...f, run, observer, ownershipWrites: () => ownershipWrites };
}

test('backup ownership: enqueue and initial account link become visible atomically', async () => {
  const f = atomicBackupOwnershipFixture();
  const output = await f.run();
  assert.equal(output.summary.backup_queued, 1);
  assert.equal(f.state.commands.length, 1);
  assert.equal(f.state.account.lastCommandId, f.state.commands[0].id);
  assert.equal((await f.observer.getPendingCommandsForNode(nodeId))[0].id, f.state.account.lastCommandId);
  // The fastest possible successful upload after commit sees the correct owner.
  const row = f.state.commands[0]; row.status = 'succeeded';
  await f.followUp.processAfterBackupSuccess(structuredClone(row));
  assertEnqueued(f, row);
});

test('backup ownership: ordinary enqueue rejection does not change account ownership', async () => {
  const f = atomicBackupOwnershipFixture({ rejectEnqueue: true });
  const before = structuredClone(f.state);
  const output = await f.run();
  assert.equal(output.summary.failed, 1); assert.equal(output.summary.backup_queued, 0);
  assert.match(output.results[0].reason, /active config_backup_now command/);
  assert.deepEqual(f.state, before); assert.equal(f.ownershipWrites(), 0);
});

test('backup ownership: rejected account write rolls back the enqueued command and secret', async () => {
  const f = atomicBackupOwnershipFixture({ rejectOwnership: true });
  const output = await f.run();
  assert.equal(output.summary.failed, 1); assert.equal(output.summary.backup_queued, 0);
  assert.match(output.results[0].reason, /ownership write rejection/);
  assert.equal(f.state.commands.length, 0); assert.equal(f.state.account.lastCommandId, 'previous-command');
  assert.deepEqual(await f.observer.getPendingCommandsForNode(nodeId), []);
});

test('backup ownership: modified technician source passes targeted TypeScript checking', () => {
  const source = fileURLToPath(new URL('../src/technicians/technicians.service.ts', import.meta.url));
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([source], options));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
});

for (const type of ['config_backup_now', 'table_search']) {
  test(`delivery attempt: ${type} retry keeps ID and advances durable heartbeat/ACK identity`, async () => {
    const row = command({ type, status: 'failed', runningAt: new Date(), resultJson: {}, maxRetries: 1,
      expiresAt: new Date(Date.now() + 3600_000) });
    const f = recoveryFixture([row]);
    await new CommandWorkerService(f.db, {}, {}).processRetries();
    f.state.commands[0].nextRetryAt = null;
    const delivered = (await f.service.getPendingCommandsForNode(nodeId))[0];
    assert.equal(delivered.id, row.id); assert.equal(delivered.delivery_attempt, 1);
    const response = await ack(f, { ...row, retryCount: 1 }, 'running');
    assert.equal(response.delivery_attempt, 1); assert.equal(response.execute, true);
    const completed = await result(f, { ...row, retryCount: 1 });
    assert.equal(completed.delivery_attempt, 1); assert.equal(completed.status, 'succeeded');
  });
}

test('delivery attempt: new ACK/result require an integer attempt; legacy absence remains compatible', async () => {
  for (const attempt of [undefined, -1, 0.5, '0', null, 2147483648]) {
    for (const method of ['acknowledgeCommand', 'reportCommandResult']) {
      const row = command(); const f = recoveryFixture([row]);
      await assert.rejects(f.service[method]({ nodeId, credentialId: userId, commandId: row.id,
        status: method === 'acknowledgeCommand' ? 'running' : 'succeeded', deliveryAttempt: attempt }), /integer >= 0/);
      assert.equal(f.state.commands[0].status, 'pending'); assert.equal(f.state.audit.length, 0);
      assert.equal(f.state.commands[0].payloadJson.password, row.payloadJson.password);
    }
  }
  const row = command(); const f = recoveryFixture([row], '0.5.25');
  assert.equal((await f.service.acknowledgeCommand({ nodeId, credentialId: userId, commandId: row.id, status: 'picked_up' })).status, 'picked_up');
  assert.equal((await f.service.getPendingCommandsForNode(nodeId)).length, 0);
});

test('delivery attempt: stale ACK/result cannot alter current retry or an expired winner', async () => {
  for (const status of ['pending', 'running', 'succeeded', 'expired']) {
    for (const method of ['acknowledgeCommand', 'reportCommandResult']) {
      const row = command({ status, retryCount: 1 }); const f = recoveryFixture([row]);
      await assert.rejects(f.service[method]({ nodeId, credentialId: userId, commandId: row.id,
        status: method === 'acknowledgeCommand' ? 'running' : 'succeeded', deliveryAttempt: 0 }), /does not match/);
      assert.equal(f.state.commands[0].status, status); assert.equal(f.state.audit.length, 0);
    }
  }
});

for (const method of ['acknowledgeCommand', 'reportCommandResult']) {
  test(`delivery attempt: ${method} CAS rechecks generation after a retry interleaving`, async () => {
    const row = command(); const f = recoveryFixture([row]);
    f.db.$transaction = fn => fn(f.db); // competitor's committed write is outside this caller's rollback
    f.hooks.beforeUpdate = async () => {
      delete f.hooks.beforeUpdate;
      Object.assign(f.state.commands[0], { retryCount: 1, status: 'pending' });
    };
    await assert.rejects(f.service[method]({ nodeId, credentialId: userId, commandId: row.id,
      status: method === 'acknowledgeCommand' ? 'running' : 'succeeded', deliveryAttempt: 0 }), /does not match/);
    assert.equal(f.state.commands[0].retryCount, 1); assert.equal(f.state.commands[0].status, 'pending');
    assert.equal(f.state.audit.length, 0);
  });
}

test('delivery attempt: DTOs validate integer attempts while keeping the legacy field optional', async () => {
  const { validate } = require('class-validator');
  for (const Dto of [CommandAckDto, CommandResultDto]) {
    for (const attempt of [-1, 1.5, '1', 2147483648]) {
      const dto = Object.assign(new Dto(), { command_id: randomUUID(), status: Dto === CommandAckDto ? 'running' : 'succeeded', delivery_attempt: attempt });
      assert.ok((await validate(dto)).some(x => x.property === 'delivery_attempt'));
    }
    const dto = Object.assign(new Dto(), { command_id: randomUUID(), status: Dto === CommandAckDto ? 'running' : 'succeeded' });
    assert.equal((await validate(dto)).length, 0);
  }
});

function uploadFenceFixture({ version = '0.5.26', retryCount = 1, status = 'running', rejectRecord = false, loseCommitReply = false, postCommitFailure = false, rejectFinalRead = false } = {}) {
  const row = command({ type: 'config_backup_now', status, retryCount, payloadJson: {} });
  const f = recoveryFixture([row], version);
  f.state.backups = []; f.state.credentialWrites = 0;
  let activeTransaction = 0;
  let cryptoWrites = 0;
  let postCalls = 0;
  const files = new Map([['/synthetic/collision.enc', 'existing-ciphertext']]);
  f.db.nodeConfigBackup = {
    findFirst: async ({ where }) => structuredClone(f.state.backups.find(record => matches(record, where)) ?? null),
    create: async ({ data }) => {
      if (rejectRecord) throw new Error('synthetic backup record rejection');
      const record = { id: randomUUID(), ...structuredClone(data) };
      f.state.backups.push(record); return record;
    },
  };
  f.db.nodeCredential = { update: async () => { f.state.credentialWrites++; } };
  const readCommand = f.db.nodeCommand.findUnique;
  f.db.nodeCommand.findUnique = async input => {
    if (rejectFinalRead && f.state.audit.some(x => x.action === 'backup.config.request_succeeded')) {
      throw new Error('synthetic final transaction query failure');
    }
    return readCommand(input);
  };
  const transaction = f.db.$transaction;
  f.db.$transaction = async fn => {
    activeTransaction++;
    try {
      const output = await transaction(fn);
      if (loseCommitReply) { loseCommitReply = false; throw new Error('synthetic lost COMMIT reply'); }
      return output;
    } finally { activeTransaction--; }
  };
  const storage = {
    sha256Hex: bytes => createHash('sha256').update(bytes).digest('hex'),
    buildStoragePath: () => ({ absolutePath: '/synthetic/collision.enc', relativePath: 'collision.enc' }),
    encryptToFile: async (_bytes, path) => { cryptoWrites++; files.set(path, 'new-ciphertext'); },
    removeFile: async path => { files.delete(path); },
  };
  const post = async () => {
    assert.equal(activeTransaction, 0, 'retention/drift must run after the transaction');
    postCalls++;
    if (postCommitFailure) throw new Error('synthetic post-commit failure');
  };
  const commandService = new BackupsCommandService(f.db, f.service);
  const ingest = new BackupsIngestService(f.db, { authenticateNodeRequest: async () => ({
    headerNodeUid: 'synthetic', node: { ...f.state.node, nodeUid: 'synthetic' }, credential: { id: userId },
  }) }, storage, { enforceRetention: post }, commandService, { evaluateStoredBackup: post });
  ingest.logger.log = () => {}; ingest.logger.warn = () => {};
  const bytes = Buffer.from('<pfsense><synthetic>only</synthetic></pfsense>');
  const request = {
    rawBody: bytes, headerCommandId: row.id, headerCommandDeliveryAttempt: String(retryCount),
    headerBackupId: randomUUID(), headerConfigSha256: storage.sha256Hex(bytes), headerConfigSize: String(bytes.length),
  };
  return { ...f, row, ingest, request, files, cryptoWrites: () => cryptoWrites, postCalls: () => postCalls };
}

test('delivery attempt: stale/malformed upload is rejected before file, metadata or credential writes', async () => {
  for (const attempt of [undefined, '-1', '1.5', ' 1', '2147483648', '0']) {
    const f = uploadFenceFixture();
    await assert.rejects(f.ingest.ingestConfigBackup({ ...f.request, headerCommandDeliveryAttempt: attempt }));
    assert.equal(f.cryptoWrites(), 0); assert.equal(f.state.backups.length, 0);
    assert.equal(f.state.credentialWrites, 0); assert.equal(f.state.audit.length, 0);
    assert.equal(f.state.commands[0].status, 'running');
  }
});

for (const status of ['cancelled', 'expired', 'failed']) {
  test(`delivery attempt: new upload cannot resurrect ${status}`, async () => {
    const f = uploadFenceFixture({ status });
    await assert.rejects(f.ingest.ingestConfigBackup(f.request), /terminal/);
    assert.equal(f.state.commands[0].status, status); assert.equal(f.cryptoWrites(), 0);
  });
}

test('delivery attempt: upload rollback cleans only its fresh ciphertext and preserves existing files', async () => {
  const f = uploadFenceFixture({ rejectRecord: true });
  await assert.rejects(f.ingest.ingestConfigBackup(f.request), /record rejection/);
  assert.deepEqual([...f.files], [['/synthetic/collision.enc', 'existing-ciphertext']]);
  assert.equal(f.state.backups.length, 0); assert.equal(f.state.audit.length, 0);
  assert.equal(f.state.commands[0].status, 'running'); assert.equal(f.state.credentialWrites, 0);
});

test('delivery attempt: lost upload/COMMIT reply is idempotent and preserves the committed file', async () => {
  const f = uploadFenceFixture({ loseCommitReply: true });
  const first = await f.ingest.ingestConfigBackup(f.request);
  assert.equal(first.ok, true); assert.equal(f.state.commands[0].status, 'succeeded');
  const again = await f.ingest.ingestConfigBackup(f.request);
  assert.equal(again.backup_id, first.backup_id); assert.equal(f.state.backups.length, 1);
  assert.equal(f.cryptoWrites(), 1); assert.equal(f.files.size, 2);
  assert.equal(f.state.backups[0].metadataJson.delivery_attempt, 1);
});

test('delivery attempt: post-commit retention/drift errors keep successful ingest and do not duplicate', async () => {
  const f = uploadFenceFixture({ postCommitFailure: true });
  assert.equal((await f.ingest.ingestConfigBackup(f.request)).ok, true);
  assert.equal(f.postCalls(), 2); assert.equal(f.state.commands[0].status, 'succeeded');
  await f.ingest.ingestConfigBackup(f.request);
  assert.equal(f.cryptoWrites(), 1); assert.equal(f.state.backups.length, 1);
});

test('delivery attempt: legacy upload still accepts absence without new metadata or fencing contract', async () => {
  const f = uploadFenceFixture({ version: '0.5.25', retryCount: 0 });
  const response = await f.ingest.ingestConfigBackup({ ...f.request, headerCommandDeliveryAttempt: undefined });
  assert.equal(response.ok, true); assert.equal(f.state.backups[0].metadataJson, undefined);
  assert.equal(f.state.commands[0].status, 'succeeded');
});

test('delivery attempt: source and DTO/controller/upload graph pass targeted TypeScript checking', () => {
  const roots = [
    '../src/node-commands/node-commands.service.ts', '../src/backups/backups-ingest.controller.ts',
  ].map(path => fileURLToPath(new URL(path, import.meta.url)));
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(roots, options));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
});

test('upload finalization: nonce preserves terminal .enc extension required by DR', async () => {
  const f = uploadFenceFixture();
  await f.ingest.ingestConfigBackup(f.request);
  const path = f.state.backups[0].storagePath;
  assert.match(path, /\.[0-9a-f-]{36}\.enc$/);
  assert.notEqual(path, '/synthetic/collision.enc');
  assert.equal(f.files.get('/synthetic/collision.enc'), 'existing-ciphertext');
});

test('upload finalization: final callback query failure is known rollback and cleans prepared ciphertext', async () => {
  const f = uploadFenceFixture({ rejectFinalRead: true });
  await assert.rejects(f.ingest.ingestConfigBackup(f.request), /final transaction query failure/);
  assert.equal(f.cryptoWrites(), 1, 'the callback prepared a file before its final query failed');
  assert.deepEqual([...f.files], [['/synthetic/collision.enc', 'existing-ciphertext']]);
  assert.equal(f.state.backups.length, 0); assert.equal(f.state.commands[0].status, 'running');
  assert.equal(f.state.audit.length, 0); assert.equal(f.state.credentialWrites, 0);
});
