// Directed source-only regression: no build, DB connection, network or output files.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true },
    fileName: filename,
  });
  mod._compile(outputText, filename);
};
Object.assign(process.env, {
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic',
  AUTH_BOOTSTRAP_EMAIL: 'synthetic@example.invalid', AUTH_BOOTSTRAP_PASSWORD: 'synthetic-only',
  NODE_SECRET_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 1).toString('base64'),
  BACKUP_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 2).toString('base64'),
  RBAC_SCOPE_ENABLED: 'true',
});
const { NodesService } = require('./nodes.service.ts');
const { AccessPolicyService } = require('../auth/access-policy.service.ts');
const { BackupFleetQueryDto } = require('./dto/backup-fleet-query.dto.ts');
const { ListNodesQueryDto } = require('./dto/list-nodes-query.dto.ts');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { computeBackupFleetSummary, filterByBackupStatus, sortBackupFleetNodes } = require('../../../web/lib/backup-fleet-helpers.ts');
const actor = { userId: 'synthetic-user', role: 'superadmin' };
const now = Date.now();
function fixtures(n) {
  return Array.from({ length: n }, (_, i) => {
    const status = ['ok', 'late', 'never', 'failed'][i % 4];
    return {
      id: String(i).padStart(8, '0'), nodeUid: `uid-${i}`, hostname: `fw-${String(i).padStart(8, '0')}`,
      displayName: null, agentVersion: i < 1000 ? '0.5.26' : null,
      nodeUidStatus: i >= n - 5 ? 'blocked' : 'active',
      status: 'online', lastSeenAt: new Date(now - 86400000), maintenanceMode: false,
      managementIp: null, wanIp: null, remoteAccessUrl: null, pfsenseVersion: null,
      criticality: 'standard', nodeTags: [], _count: { alerts: 0 }, configBackupPolicyJson: null,
      siteId: i % 2 ? 'site-b' : 'site-a',
      site: { id: i % 2 ? 'site-b' : 'site-a', name: i % 2 ? 'Site B' : 'Site A', code: 's', timezone: 'UTC',
        clientId: i % 2 ? 'client-b' : 'client-a',
        client: { id: i % 2 ? 'client-b' : 'client-a', name: i % 2 ? 'Client B' : 'Client A', code: 'c' } },
      configBackups: ['ok', 'late'].includes(status) ? [{ status: 'stored', configSha256: 'synthetic',
        receivedAt: new Date(now - (status === 'ok' ? 3600000 : 864000000)) }] : [],
      nodeCommands: status === 'failed' ? [{ requestedAt: new Date(now), completedAt: null }] : [],
    };
  });
}
function matches(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return value.every(x => matches(row, x));
    if (key === 'OR') return value.some(x => matches(row, x));
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('contains' in value) return String(row[key] ?? '').toLowerCase().includes(value.contains.toLowerCase());
      return matches(row[key], value);
    }
    return row[key] === value;
  });
}
function harness(n, allowed = ['client-a']) {
  const rows = fixtures(n), calls = [], transactions = [];
  const prisma = {
    userClientScope: { findMany: async () => allowed.map(clientId => ({ clientId })) },
    node: { findMany: async args => {
      calls.push(args);
      const eligible = rows.filter(row => matches(row, args.where));
      const start = args.cursor ? eligible.findIndex(row => row.id === args.cursor.id) + args.skip : 0;
      return eligible.slice(start, start + args.take);
    } },
    $transaction: async (fn, options) => { transactions.push(options); return fn(prisma); },
  };
  const service = new NodesService(prisma, new AccessPolicyService(prisma, {}));
  return { rows, calls, transactions, service };
}
for (const size of [1105, 5105]) {
  test(`backup fleet ${size}: one scan, exact summary, only page payload; counted legacy comparison`, async t => {
    const h = harness(size);
    const start = performance.now();
    const result = await h.service.getBackupFleet(actor, { page: 2, per_page: 25, backup_status: 'failed' });
    const elapsed = performance.now() - start;
    const scans = Math.floor(size / 250) + 1;
    assert.equal(h.calls.length, scans);
    assert.equal(h.transactions.length, 1);
    assert.equal(h.transactions[0].isolationLevel, 'RepeatableRead');
    assert.equal(result.summary.total, size);
    assert.equal(result.total, Math.floor(size / 4));
    assert.equal(result.items.length, 25);
    assert.ok(result.items.every(x => x.backup_status === 'failed'));
    assert.equal(result.page, 2);
    assert.equal(result.total_pages, Math.ceil(result.total / 25));
    for (const call of h.calls) {
      assert.equal(call.take, 250);
      assert.ok(call.select);
      for (const field of ['status', 'nodeSecret', '_count', 'nodeTags', 'cpuPercent']) assert.equal(call.select[field], undefined);
    }
    h.calls.length = 0;
    const all = [];
    let cursor;
    do {
      const page = await h.service.listNodes(actor, { limit: 1000, cursor });
      all.push(...page.items); cursor = page.next_cursor ?? undefined;
    } while (cursor);
    assert.equal(h.calls.length, Math.ceil(size / 1000) * scans);
    assert.equal(all.length, size);
    assert.deepEqual(result.summary, computeBackupFleetSummary(all));
    const expected = sortBackupFleetNodes(filterByBackupStatus(all, 'failed'), 'backup_priority', 'asc').slice(25, 50);
    assert.deepEqual(result.items.map(x => x.id), expected.map(x => x.id));
    t.diagnostic(`${size}: new ${scans} node.findMany calls, legacy ${h.calls.length}; synthetic new elapsed ${elapsed.toFixed(1)}ms (not SQL/p95)`);
  });
}
test('bootstrap bucket filters before pagination, totals >1000, next/back and cursor binding', async () => {
  const { service } = harness(1105);
  const first = await service.listNodes(actor, { bootstrap_bucket: 'pending', limit: 50 });
  assert.equal(first.total, 100);
  assert.equal(first.items.length, 50);
  assert.deepEqual(first.bootstrap_summary, { active: 1000, pending: 100, blocked: 5, total: 1105 });
  assert.equal(first.items[0].id, '00001000');
  const next = await service.listNodes(actor, { bootstrap_bucket: 'pending', limit: 50, cursor: first.next_cursor });
  assert.equal(next.items[0].id, '00001050');
  assert.equal(next.next_cursor, null);
  const back = await service.listNodes(actor, { bootstrap_bucket: 'pending', limit: 50, cursor: next.previous_cursor });
  assert.deepEqual(back.items.map(x => x.id), first.items.map(x => x.id));
  await assert.rejects(service.listNodes(actor, { bootstrap_bucket: 'active', limit: 50, cursor: first.next_cursor }), /Cursor/);
  const installed = await service.listNodes(actor, { bootstrap_bucket: 'active', limit: 50 });
  assert.equal(installed.total, 1000);
  assert.ok(installed.items.every(x => x.effective_status === 'offline' && x.agent_version));
  assert.equal((await service.listNodes(actor, { bootstrap_bucket: 'blocked' })).total, 5);
});
test('backup client scope, requested foreign client, search/site intersections and empty scope', async () => {
  const h = harness(1105), restricted = { userId: 'limited', role: 'operator' };
  const result = await h.service.getBackupFleet(restricted, { search: 'Client A', site_id: 'site-a', per_page: 50 });
  assert.equal(result.summary.total, 553);
  assert.equal(result.total, 553);
  assert.ok(result.items.every(x => x.client.id === 'client-a'));
  assert.equal((await h.service.getBackupFleet(restricted, { site_id: 'site-b' })).total, 0);
  await assert.rejects(h.service.getBackupFleet(restricted, { client_id: 'client-b' }), /out of scope/);
  const empty = await harness(1105, []).service.getBackupFleet(restricted, {});
  assert.deepEqual(empty.summary, { total: 0, ok: 0, late: 0, never: 0, failed: 0 });
  assert.deepEqual(empty.items, []);
});
test('backup all sorts/directions, clamped page and empty filter', async () => {
  const { service } = harness(1105);
  for (const sort_by of ['name', 'backup_priority', 'backup_age']) {
    for (const sort_order of ['asc', 'desc']) {
      const result = await service.getBackupFleet(actor, { sort_by, sort_order, per_page: 10, page: 1000000 });
      assert.equal(result.page, 111);
      assert.equal(result.items.length, 5);
      assert.equal(new Set(result.items.map(x => x.id)).size, 5);
    }
  }
  const none = await service.getBackupFleet(actor, { search: 'not-present' });
  assert.equal(none.total_pages, 1);
  assert.equal(none.page, 1);
  assert.equal(none.items.length, 0);
  await assert.rejects(service.getBackupFleet(actor, { page: 0 }), /pagination/);
  await assert.rejects(service.getBackupFleet(actor, { per_page: 1000 }), /pagination/);
});
test('DTO rejects unsupported filters and unbounded page sizes', () => {
  for (const input of [{ page: '0' }, { page: '1000001' }, { page: '1.5' }, { per_page: '1000' },
    { backup_status: 'x' }, { sort_by: 'health' }, { client_id: 'not-uuid' }, { search: 'x'.repeat(121) }]) {
    assert.ok(validateSync(plainToInstance(BackupFleetQueryDto, input)).length, JSON.stringify(input));
  }
  assert.equal(validateSync(plainToInstance(BackupFleetQueryDto, { page: '2', per_page: '25' })).length, 0);
  assert.ok(validateSync(plainToInstance(ListNodesQueryDto, { bootstrap_bucket: 'wrong' })).length);
});
