/**
 * New opt-in PG group. Loads ONLY the final compiled API and its real Prisma client.
 * No Docker, SSH, migrations, app bootstrap, worker, appliance or HTTP server is started.
 * Mount this file in the NEW API image after its single final build. Do not use the old image.
 *
 * Example INSIDE monitor-pfsense-qa-api (parent prepares/migrates the isolated PG):
 *   MONITOR_QA_POSTGRES_INTEGRATION=1 MONITOR_QA_CONTAINER_NAME=monitor-pfsense-qa-api \
 *   PAGINATION_QA_DATABASE_URL=postgres://qa@db:5432/monitor_qa PAGINATION_API_ROOT=/app \
 *   PAGINATION_QA_KEEP_SEED=1 PAGINATION_QA_MANIFEST=/qa/pagination-qa-seed.json \
 *     node --test /qa/pagination-postgres.integration.mjs
 *
 * Select phases with PAGINATION_QA_PHASES=nodes,filters,rbac,alerts (default all).
 * Critical-path retry: PAGINATION_QA_PHASES=alerts PAGINATION_QA_KEEP_SEED=1,
 * with the same guarded env and a NEW manifest path (exclusive creation is kept).
 * Run service tests in a one-shot node process while the QA HTTP API is STOPPED:
 * its NodeLifecycleService timer otherwise creates heartbeat_missing alerts for
 * the offline fixtures. Do not adjust expected 1105 or change product health logic.
 * Restart HTTP only after this group, for the parent's separate browser validation.
 * Earlier nodes/filters/RBAC PASS evidence is reused externally; unselected phases
 * are explicitly NOT RUN in this run's manifest, never reported as newly passed.
 *
 * Default: remove only this run's fixtures, even on failure. KEEP_SEED=1 preserves them
 * ONLY after all assertions pass, for the parent's separate authenticated browser check.
 * Manifest contains IDs/search target, never DB credentials, passwords, cookies or tokens.
 * Browser: filter /nodes by manifest.clients[0].id, navigate >1000, search target.node_uid;
 * repeat target selection in tokens/admin technicians, and /alerts beyond page 40.
 * Use the staging bootstrap login: fixture users intentionally have no login password.
 *
 * Afterwards, SAME guarded container/env/manifest:
 *   node /qa/pagination-postgres.integration.mjs --cleanup
 * Cleanup is idempotent, verifies ownership (UUID + exact run code/email), never truncates.
 * Failed/incomplete runs are cleaned automatically. SIGKILL requires explicit --cleanup.
 * No-env test invocation SKIPS without importing dist/Prisma or opening a connection.
 * Local preparation checks (no DB/imports/dist required):
 *   node --check apps/api/test/pagination-postgres.integration.mjs
 *   node apps/api/test/pagination-postgres.integration.mjs --guard-self-test
 *   node apps/api/test/pagination-postgres.integration.mjs --phase-self-test
 *
 * Metrics: per-phase/call elapsed time, query count and process RSS/heap/high-water RSS.
 * These are generic smoke budgets, NOT a load benchmark or a proof of constant memory.
 * Defaults: max call 120s, RSS growth 512 MiB; overridable via PAGINATION_QA_MAX_CALL_MS
 * / PAGINATION_QA_MAX_RSS_GROWTH_MB. Node reads remain O(N) per page by design.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve, dirname, basename, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const PREFIX = /^monitor-pfsense-qa(?:-[a-z0-9]+)*$/;
const RUN_PREFIX = /^pagination-qa-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COUNT = 1105;
const HIDDEN_COUNT = 17;
const INACTIVE_COUNT = 5;
const SORTS = ['name', 'agent_version', 'version', 'status', 'backup', 'alerts', 'last_seen'];
const PHASES = ['nodes', 'filters', 'rbac', 'alerts'];
const fail = (message) => { throw new Error(message); };

export function validateQaUrl(raw, env = process.env, inContainer = existsSync('/.dockerenv')) {
  if (env.MONITOR_QA_POSTGRES_INTEGRATION !== '1') fail('Explicit MONITOR_QA_POSTGRES_INTEGRATION=1 is required');
  const container = env.MONITOR_QA_CONTAINER_NAME || env.HOSTNAME || '';
  if (!PREFIX.test(container) || /prod/i.test(container)) fail('Container identity must have prefix monitor-pfsense-qa');
  let url;
  try { url = new URL(raw); } catch { fail('Invalid QA PostgreSQL URL (value suppressed)'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/monitor_qa' || url.hash) fail('Only PostgreSQL database monitor_qa is allowed');
  const host = url.hostname;
  if (!(PREFIX.test(host) && !/prod/i.test(host)) && !(host === 'db' && inContainer)) fail('Host must be monitor-pfsense-qa-*; db alias requires guarded QA container');
  // Prisma accepts routing/search-path overrides in URL parameters: reject every
  // unknown option, especially host/options/socket/schema tricks around the guard.
  for (const [key, value] of url.searchParams) {
    if (key === 'schema' && value === 'public') continue;
    if (['connection_limit', 'connect_timeout', 'pool_timeout'].includes(key) && /^[1-9]\d?$/.test(value)) continue;
    if (key === 'sslmode' && ['disable', 'prefer', 'require', 'verify-full'].includes(value)) continue;
    fail('Unsupported QA database URL parameter');
  }
  if (!url.username) fail('Explicit QA database user is required');
  url.searchParams.set('connection_limit', '4');
  url.searchParams.set('connect_timeout', '5');
  url.searchParams.set('pool_timeout', '10');
  return url;
}

function guardSelfTest() {
  const env = { MONITOR_QA_POSTGRES_INTEGRATION: '1', MONITOR_QA_CONTAINER_NAME: 'monitor-pfsense-qa-api' };
  assert.equal(validateQaUrl('postgres://qa@db:5432/monitor_qa', env, true).hostname, 'db');
  assert.equal(validateQaUrl('postgresql://qa@monitor-pfsense-qa-db/monitor_qa', env, false).pathname, '/monitor_qa');
  for (const raw of ['postgres://qa@db/monitor', 'postgres://qa@db/postgres', 'postgres://qa@192.168.100.221/monitor_qa',
    'postgres://qa@localhost/monitor_qa', 'postgres://qa@production/monitor_qa', 'postgres://qa@monitor-pfsense-qa-prod/monitor_qa',
    'postgres://qa@db/monitor_qa?host=production', 'postgres://qa@db/monitor_qa?options=x', 'postgres://qa@db/monitor_qa?schema=production',
    'postgres://qa@db/monitor_qa#fragment', 'postgres://qa@db/monitor_qa?connection_limit=999', 'https://db/monitor_qa']) {
    assert.throws(() => validateQaUrl(raw, env, true));
  }
  assert.throws(() => validateQaUrl('postgres://qa@db/monitor_qa', {}, true));
  assert.throws(() => validateQaUrl('postgres://qa@db/monitor_qa', { ...env, MONITOR_QA_POSTGRES_INTEGRATION: '0' }, true));
  assert.throws(() => validateQaUrl('postgres://qa@db/monitor_qa', { ...env, MONITOR_QA_CONTAINER_NAME: 'production-api' }, true));
  assert.throws(() => validateQaUrl('postgres://qa@db/monitor_qa', env, false));
  console.log('QA URL/sentinel/container guard: accepted dedicated host and guarded db alias; rejected unsafe targets/options (no DB connection).');
}

export function selectQaPhases(raw) {
  if (raw === undefined || raw === 'all') return new Set(PHASES);
  const phases = raw.split(',').map((name) => name.trim());
  if (phases.some((name) => !PHASES.includes(name)) || new Set(phases).size !== phases.length) {
    fail('Invalid PAGINATION_QA_PHASES: use nodes,filters,rbac,alerts or all');
  }
  return new Set(phases);
}

function phaseSelfTest() {
  assert.deepEqual([...selectQaPhases(undefined)], PHASES);
  assert.deepEqual([...selectQaPhases('all')], PHASES);
  assert.deepEqual([...selectQaPhases('alerts')], ['alerts']);
  assert.deepEqual([...selectQaPhases('filters, rbac')], ['filters', 'rbac']);
  for (const value of ['', 'unknown', 'alerts,alerts', 'all,alerts', 'alerts,']) assert.throws(() => selectQaPhases(value));
  const selection = selectQaPhases('alerts');
  const invoked = [];
  for (const key of PHASES) if (selection.has(key)) invoked.push(key);
  assert.deepEqual(invoked, ['alerts']);
  console.log('Phase selection: alerts executes only alerts; defaults/subsets accepted, invalid/duplicate/empty phases rejected (no DB/imports/dist).');
}

function numberEnv(key, fallback, max) {
  const value = process.env[key] === undefined ? fallback : Number(process.env[key]);
  if (!Number.isFinite(value) || value <= 0 || value > max) fail(`Invalid ${key}`);
  return value;
}
function manifestPath() {
  const path = process.env.PAGINATION_QA_MANIFEST;
  if (!path) return null;
  if (!isAbsolute(path) || !/^pagination-qa-[a-z0-9-]+\.json$/.test(basename(path))) fail('Manifest needs an absolute pagination-qa-*.json path');
  return path;
}
function validateManifest(m) {
  assert.equal(m.version, 1); assert.match(m.run, RUN_PREFIX);
  assert.equal(m.database, 'monitor_qa'); assert.equal(m.clients.length, 3); assert.equal(m.users.length, 4);
  for (const [i, client] of m.clients.entries()) {
    assert.match(client.id, UUID); assert.equal(client.code, `${m.run}-${['A', 'B', 'C'][i]}`);
  }
  for (const [i, user] of m.users.entries()) {
    assert.match(user.id, UUID); assert.equal(user.email, `user-${i}@${m.run}.invalid`);
  }
  return m;
}
async function readManifest(path) {
  if (!path) fail('PAGINATION_QA_MANIFEST is required for cleanup');
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size < 100000, 'Unsafe manifest file');
  return validateManifest(JSON.parse(await readFile(path, 'utf8')));
}
async function storeManifest(path, manifest, create = false) {
  if (!path) return;
  if (!create) { const info = await lstat(path); assert.ok(info.isFile() && !info.isSymbolicLink()); }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { flag: create ? 'wx' : 'w', mode: 0o600 });
}

async function loadRuntime(url) {
  // Never import synthetic-env.mjs: it silently rewrites DATABASE_URL for another group.
  // Refuse a conflicting inherited DATABASE_URL rather than hiding a production target.
  if (process.env.DATABASE_URL) {
    const inherited = validateQaUrl(process.env.DATABASE_URL);
    assert.equal(inherited.toString(), url.toString(), 'DATABASE_URL conflicts with explicit QA target');
  }
  process.env.DATABASE_URL = url.toString();
  Object.assign(process.env, {
    NODE_ENV: 'test', RBAC_SCOPE_ENABLED: 'true', RBAC_PERMISSIONS_ENABLED: 'true',
    AUTH_BOOTSTRAP_EMAIL: 'pagination-qa@example.invalid', AUTH_BOOTSTRAP_PASSWORD: 'Synthetic-QA-unused-no-login',
    NODE_SECRET_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 19).toString('base64'),
    BACKUP_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 23).toString('base64'),
    NODE_DEGRADED_AFTER_SECONDS: '3600', NODE_OFFLINE_AFTER_SECONDS: '7200',
    PACKAGE_RELEASE_VERSION: '0.5.25', COMMAND_WORKER_ENABLED: 'false', TRUST_PROXY: 'false', TRUSTED_PROXY_IPS: '',
  });
  const root = resolve(process.env.PAGINATION_API_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));
  const require = createRequire(join(root, 'package.json'));
  const packageInfo = require(join(root, 'package.json'));
  assert.equal(packageInfo.version, '0.13.0', 'This QA block requires the final API 0.13.0 image, never 0.12.0');
  const compiled = (path) => require(join(root, 'dist', path));
  const { PrismaClient } = require('@prisma/client');
  const { NodesService } = compiled('nodes/nodes.service.js');
  const { AlertsService } = compiled('alerts/alerts.service.js');
  const { AccessPolicyService } = compiled('auth/access-policy.service.js');
  const { PermissionsService } = compiled('auth/permissions.service.js');
  const { compareListNodes } = compiled('nodes/list-nodes-sort.util.js');
  assert.equal(typeof compareListNodes, 'function', 'Build the NEW API image; old compiled pagination code is forbidden');
  const { appConfig } = compiled('config/app-config.js');
  assert.equal(appConfig.rbac.scopeEnabled, true); assert.equal(appConfig.rbac.permissionsEnabled, true);
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [{ emit: 'event', level: 'query' }] });
  const permissions = new PermissionsService(db);
  const policy = new AccessPolicyService(db, permissions);
  return { db, permissions, policy, nodes: new NodesService(db, policy), alerts: new AlertsService(db, policy), compareListNodes };
}

async function assertDatabase(db) {
  const [row] = await db.$queryRaw`SELECT current_database() AS name, current_schema() AS schema`;
  assert.equal(row.name, 'monitor_qa'); assert.equal(row.schema, 'public');
}
async function cleanupSeed(db, m) {
  validateManifest(m);
  // Only UUIDs with this run's exact names can be deleted. Existing bootstrap users,
  // role/permission tables and any other run are untouched; cascades are FK-owned.
  await db.$transaction(async (tx) => {
    for (const user of m.users) await tx.user.deleteMany({ where: { id: user.id, email: user.email } });
    for (const client of m.clients) await tx.client.deleteMany({ where: { id: client.id, code: client.code } });
    assert.equal(await tx.client.count({ where: { id: { in: m.clients.map((c) => c.id) } } }), 0, 'Cleanup ownership mismatch');
    assert.equal(await tx.user.count({ where: { id: { in: m.users.map((u) => u.id) } } }), 0, 'Cleanup user ownership mismatch');
  }, { timeout: 60000 });
}
async function batches(delegate, data) {
  for (let i = 0; i < data.length; i += 250) await delegate.createMany({ data: data.slice(i, i + 250) });
}

async function seed(db, manifest) {
  const { run, clients, users } = manifest;
  const sites = [0, 0, 1, 2].map((client, i) => ({ id: randomUUID(), clientId: clients[client].id, name: `${run} Site ${i}`, code: `QA-${i}`, timezone: 'UTC' }));
  const tags = [0, 1].map((client) => ({ id: randomUUID(), clientId: clients[client].id, name: `${run} tag` }));
  const groups = [0, 1].map((client) => ({ id: randomUUID(), clientId: clients[client].id, name: `${run} group` }));
  const now = new Date();
  const allNodes = Array.from({ length: COUNT + HIDDEN_COUNT + INACTIVE_COUNT }, (_, index) => {
    const n = index + 1;
    const client = n <= COUNT ? 0 : n <= COUNT + HIDDEN_COUNT ? 1 : 2;
    const status = ['online', 'degraded', 'offline', 'maintenance', 'unknown', 'online', 'online'][n % 7];
    return { id: randomUUID(), siteId: sites[client === 0 ? n % 2 : client + 1].id,
      nodeUid: `${run}-node-${n}`, hostname: `qa-${String(n).padStart(4, '0')}.invalid`,
      displayName: `QA Firewall ${String(n % 31).padStart(2, '0')}`, status,
      maintenanceMode: status === 'maintenance', lastSeenAt: status === 'unknown' ? null : status === 'offline' ? new Date(now - 86400000) : now,
      agentVersion: n % 2 ? '0.5.25' : '0.5.24', pfsenseVersion: n % 2 ? '2.9.0' : '2.8.1',
      criticality: ['critical', 'standard', 'lab'][n % 3],
    };
  });
  const visible = allNodes.slice(0, COUNT);
  const alerts = allNodes.map((node, i) => ({ id: randomUUID(), nodeId: node.id, fingerprint: `${run}-alert-${i + 1}`,
    type: i % 2 ? 'service_down' : 'gateway_down', status: ['open', 'acknowledged', 'resolved'][i % 3],
    severity: ['critical', 'warning', 'info'][Math.floor(i / 3) % 3], title: `${run} alert ${i + 1}`,
    description: 'Synthetic pagination QA only', openedAt: new Date(now - (i % 19) * 60000),
  }));
  const backupState = (n) => ['never', 'ok', 'late', 'failed'][n % 4];
  const backups = visible.flatMap((node, i) => backupState(i + 1) === 'never' ? [] : [{
    id: randomUUID(), nodeId: node.id, backupUid: `${run}-backup-${i + 1}`, status: 'stored',
    receivedAt: new Date(now - (backupState(i + 1) === 'ok' ? 3600000 : 30 * 86400000)),
    configSha256: '0'.repeat(64), payloadSha256: '1'.repeat(64), sizeBytes: 0, payloadSizeBytes: 0,
  }]);
  const failedCommands = visible.flatMap((node, i) => backupState(i + 1) !== 'failed' ? [] : [{
    id: randomUUID(), nodeId: node.id, type: 'config_backup_now', status: 'failed', requestedAt: now, completedAt: now,
    expiresAt: new Date(now.getTime() + 86400000), errorMessage: 'Synthetic terminal fixture; never enqueued',
  }]);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(691105)`;
    assert.equal(await tx.client.count(), 0, 'QA seed requires an empty client inventory; cleanup previous seed first');
    assert.equal(await tx.node.count(), 0); assert.equal(await tx.alert.count(), 0);
    const roles = await tx.role.findMany({ where: { code: { in: ['operator', 'client', 'superadmin'] } } });
    assert.equal(roles.length, 3, 'Apply current migrations before running this test');
    await tx.client.createMany({ data: clients.map((c, i) => ({ ...c, name: `${run} Client ${i}`, status: i === 2 ? 'inactive' : 'active' })) });
    await tx.site.createMany({ data: sites });
    await tx.user.createMany({ data: users.map((u, i) => ({ ...u, role: ['operator', 'operator', 'client', 'superadmin'][i], ...(i === 2 ? { clientId: clients[0].id } : {}) })) });
    await tx.userClientScope.createMany({ data: [0, 2].map((client) => ({ userId: users[0].id, clientId: clients[client].id })) });
    await tx.tag.createMany({ data: tags }); await tx.nodeGroup.createMany({ data: groups });
    await batches(tx.node, allNodes); await batches(tx.alert, alerts);
    await batches(tx.nodeTag, visible.filter((_, i) => (i + 1) % 2 === 0).map((node) => ({ nodeId: node.id, tagId: tags[0].id })));
    await batches(tx.nodeGroupMember, visible.filter((_, i) => (i + 1) % 3 === 0).map((node) => ({ nodeId: node.id, groupId: groups[0].id })));
    await batches(tx.nodeConfigBackup, backups); await batches(tx.nodeCommand, failedCommands);
  }, { timeout: 120000, maxWait: 10000 });
  Object.assign(manifest, { sites, tags, groups, target: { id: visible.at(-1).id, node_uid: visible.at(-1).nodeUid, alert_id: alerts[COUNT - 1].id },
    counts: { scoped_nodes: COUNT, scoped_alerts: COUNT, hidden_nodes: HIDDEN_COUNT, inactive_nodes: INACTIVE_COUNT } });
  return { visible, allNodes, alerts, sites, tags, groups, backupState };
}

async function runPg(t, url, cleanupOnly) {
  const selectedPhases = cleanupOnly ? new Set() : selectQaPhases(process.env.PAGINATION_QA_PHASES);
  const path = manifestPath();
  const keep = process.env.PAGINATION_QA_KEEP_SEED === '1';
  if (keep && !path && !cleanupOnly) fail('KEEP_SEED requires PAGINATION_QA_MANIFEST for later cleanup');
  const runtime = await loadRuntime(url);
  const { db, nodes, alerts, compareListNodes } = runtime;
  let m, seeded = false, success = false;
  const metrics = { calls: 0, query_count: 0, max_call_ms: 0, max_rss: 0, max_heap: 0 };
  db.$on('query', () => { metrics.query_count++; }); // no query SQL, parameters or connection string logged
  try {
    await assertDatabase(db);
    if (cleanupOnly) {
      m = await readManifest(path); await cleanupSeed(db, m);
      m.state = 'cleaned'; await storeManifest(path, m);
      t.diagnostic('Only the manifest-owned QA seed was removed; cleanup is repeatable.');
      return;
    }
    const run = `pagination-qa-${randomUUID()}`;
    m = { version: 1, run, database: 'monitor_qa', state: 'planned', created_at: new Date().toISOString(),
      api_version: '0.13.0', selected_phases: [...selectedPhases], phase_results: {},
      clients: ['A', 'B', 'C'].map((c) => ({ id: randomUUID(), code: `${run}-${c}` })),
      users: Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), email: `user-${i}@${run}.invalid` })),
    };
    // Exclusive creation prevents overwriting an earlier run's recovery manifest.
    await storeManifest(path, m, true);
    const f = await seed(db, m); seeded = true; m.state = 'seeded'; await storeManifest(path, m);
    const roles = ['operator', 'operator', 'client', 'superadmin'];
    const [actor, emptyActor, clientActor, globalActor] = m.users.map((u, i) => ({ userId: u.id, role: roles[i] }));
    const expectedIds = new Set(f.visible.map((n) => n.id));
    const baseline = process.memoryUsage().rss;
    const maxCall = numberEnv('PAGINATION_QA_MAX_CALL_MS', 120000, 600000);
    const maxGrowth = numberEnv('PAGINATION_QA_MAX_RSS_GROWTH_MB', 512, 8192) * 1024 * 1024;
    const timed = async (fn) => {
      const start = performance.now(); const result = await fn(); const ms = performance.now() - start;
      const memory = process.memoryUsage(); metrics.calls++; metrics.max_call_ms = Math.max(metrics.max_call_ms, ms);
      metrics.max_rss = Math.max(metrics.max_rss, memory.rss); metrics.max_heap = Math.max(metrics.max_heap, memory.heapUsed);
      assert.ok(ms <= maxCall, 'QA per-call time budget exceeded');
      assert.ok(memory.rss - baseline <= maxGrowth, 'QA process RSS growth budget exceeded');
      return result;
    };
    const phase = async (key, name, fn) => {
      if (!selectedPhases.has(key)) {
        m.phase_results[key] = { status: 'not-run-selection' };
        t.diagnostic(`${key}: NOT RUN (PAGINATION_QA_PHASES selection; reuse prior evidence separately)`);
        return;
      }
      const start = performance.now();
      try {
        await fn();
        const elapsed_ms = Math.round(performance.now() - start);
        m.phase_results[key] = { status: 'pass', elapsed_ms };
        await storeManifest(path, m);
        t.diagnostic(`${key} — ${name}: PASS (${elapsed_ms} ms)`);
      } catch (error) {
        m.phase_results[key] = { status: 'failed', elapsed_ms: Math.round(performance.now() - start) };
        await storeManifest(path, m);
        throw error;
      }
    };
    async function walk(query = {}, access = actor, onPage = () => {}) {
      const ids = new Set(); let cursor, count = 0, previousItem;
      const recent = [];
      do {
        const page = await timed(() => nodes.listNodes(access, { ...query, limit: 257, cursor }));
        assert.equal(page.total, COUNT); assert.equal(page.limit, 257); assert.ok(page.items.length <= 257);
        for (const node of page.items) {
          assert.ok(expectedIds.has(node.id), 'Cross-scope node leaked'); assert.ok(!ids.has(node.id), 'Duplicate across cursor pages');
          if (previousItem) assert.ok(compareListNodes(previousItem, node, query.sort_by ?? 'name', query.sort_order ?? 'asc') < 0);
          previousItem = node; ids.add(node.id);
        }
        onPage(page); recent.push(page); if (recent.length > 2) recent.shift();
        cursor = page.next_cursor; assert.ok(++count <= 10, 'Cursor failed to terminate');
      } while (cursor);
      assert.deepEqual(ids, expectedIds); assert.equal(ids.size, COUNT); return recent;
    }
    await phase('nodes', '1105 scoped nodes, all 7 sorts both directions, UUID ties, previous/next and unique traversal', async () => {
      for (const sort_by of SORTS) for (const sort_order of ['asc', 'desc']) {
        const [beforeLast, last] = await walk({ sort_by, sort_order });
        const previous = await timed(() => nodes.listNodes(actor, { limit: 257, sort_by, sort_order, cursor: last.previous_cursor }));
        assert.deepEqual(previous.items.map((n) => n.id), beforeLast.items.map((n) => n.id));
        const again = await timed(() => nodes.listNodes(actor, { limit: 257, sort_by, sort_order, cursor: previous.next_cursor }));
        assert.deepEqual(again.items.map((n) => n.id), last.items.map((n) => n.id));
      }
    });
    const subset = async (query, expected) => {
      const ids = new Set(); let cursor, iterations = 0;
      do {
        const page = await timed(() => nodes.listNodes(actor, { ...query, limit: 137, cursor }));
        assert.equal(page.total, expected.length);
        for (const row of page.items) { assert.ok(!ids.has(row.id)); ids.add(row.id); }
        cursor = page.next_cursor; assert.ok(++iterations < 12);
      } while (cursor);
      assert.deepEqual(ids, new Set(expected.map((n) => n.id)));
    };
    await phase('filters', 'target 1105 search + client/site/tag/group/criticality/status and every preset before pagination', async () => {
      const target = await timed(() => nodes.listNodes(actor, { search: m.target.node_uid, limit: 50 }));
      assert.equal(target.total, 1); assert.equal(target.items[0].id, m.target.id);
      const n = (node) => f.visible.indexOf(node) + 1;
      await subset({ client_id: m.clients[0].id }, f.visible);
      await subset({ site_id: f.sites[0].id }, f.visible.filter((node) => n(node) % 2 === 0));
      await subset({ tag_id: f.tags[0].id }, f.visible.filter((node) => n(node) % 2 === 0));
      await subset({ group_id: f.groups[0].id }, f.visible.filter((node) => n(node) % 3 === 0));
      await subset({ criticality: 'lab' }, f.visible.filter((node) => node.criticality === 'lab'));
      await subset({ status: 'maintenance' }, f.visible.filter((node) => node.maintenanceMode));
      await subset({ site_id: f.sites[0].id, tag_id: f.tags[0].id, group_id: f.groups[0].id, criticality: 'critical', status: 'degraded' },
        f.visible.filter((node) => n(node) % 6 === 0 && node.status === 'degraded'));
      for (const preset of ['offline', 'degraded', 'backup-late', 'no-backup', 'package-outdated', 'problem']) {
        const expected = f.visible.filter((node) => preset === 'offline' ? node.status === 'offline' : preset === 'degraded' ? node.status === 'degraded'
          : preset === 'backup-late' ? ['late', 'failed'].includes(f.backupState(n(node))) : preset === 'no-backup' ? f.backupState(n(node)) === 'never'
          : preset === 'package-outdated' ? node.agentVersion !== '0.5.25'
          : ['offline', 'degraded'].includes(node.status) || (n(node) - 1) % 3 === 0 || f.backupState(n(node)) !== 'ok' || node.agentVersion !== '0.5.25');
        await subset({ preset }, expected);
      }
    });
    await phase('rbac', 'real AccessPolicy + user scopes, inactive client excluded, client profile, empty scope and forbidden UUIDs', async () => {
      const profile = await timed(() => nodes.listNodes(clientActor, { limit: 1 })); assert.equal(profile.total, COUNT);
      assert.equal((await nodes.listNodes(emptyActor, {})).total, 0);
      const global = await nodes.listNodes(globalActor, { limit: 1 }); assert.equal(global.total, COUNT + HIDDEN_COUNT + INACTIVE_COUNT);
      for (const query of [{ client_id: m.clients[1].id }, { client_id: m.clients[2].id }, { tag_id: f.tags[1].id }, { group_id: f.groups[1].id }]) {
        await assert.rejects(nodes.listNodes(actor, query), (e) => e.getStatus?.() === 403);
      }
      assert.equal((await nodes.listNodes(actor, { site_id: f.sites[2].id })).total, 0);
      assert.equal((await nodes.listNodes(actor, { search: f.allNodes[COUNT].nodeUid })).total, 0);
      const first = await nodes.listNodes(actor, { limit: 50 });
      for (const changed of [{ search: m.target.node_uid }, { sort_by: 'backup' }, { sort_order: 'desc' }]) await assert.rejects(nodes.listNodes(actor, { ...changed, cursor: first.next_cursor }), (e) => e.getStatus?.() === 400);
      await assert.rejects(nodes.listNodes(clientActor, { cursor: first.next_cursor }), (e) => e.getStatus?.() === 400);
      for (const limit of [0, 1.5, 1001]) await assert.rejects(nodes.listNodes(actor, { limit }), (e) => e.getStatus?.() === 400);
      const legacy = await nodes.listNodes(actor, {}); assert.equal(legacy.items.length, 500); assert.equal(legacy.total, COUNT);
    });
    await phase('alerts', '1105 real PG alerts, both orderings, complete totals, later pages, filters and legacy contract', async () => {
      const expectedAlerts = f.alerts.slice(0, COUNT);
      const expectedTotals = { open: 0, acknowledged: 0, resolved: 0, critical: 0, warning: 0, info: 0 };
      for (const alert of expectedAlerts) { expectedTotals[alert.status]++; expectedTotals[alert.severity]++; }
      for (const sort_by of ['legacy', 'attention']) {
        const seen = new Set();
        const expectedOrder = await db.alert.findMany({ where: { node: { site: { clientId: m.clients[0].id } } },
          orderBy: sort_by === 'attention' ? [{ severity: 'asc' }, { openedAt: 'asc' }, { id: 'asc' }]
            : [{ status: 'asc' }, { severity: 'asc' }, { openedAt: 'desc' }, { id: 'asc' }], select: { id: true } });
        for (let page = 1; page <= 9; page++) {
          const result = await timed(() => alerts.listAlerts(actor, { page, limit: 137, sort_by }));
          assert.equal(result.total, COUNT); assert.equal(result.page, page); assert.equal(result.total_pages, 9); assert.deepEqual(result.totals, expectedTotals);
          assert.deepEqual(result.items.map((a) => a.id), expectedOrder.slice((page - 1) * 137, page * 137).map((a) => a.id));
          for (const alert of result.items) { assert.equal(alert.client.id, m.clients[0].id); assert.ok(!seen.has(alert.id)); seen.add(alert.id); }
        }
        assert.equal(seen.size, COUNT);
      }
      const filtered = await alerts.listAlerts(actor, { page: 1, limit: 25, status: 'open', severity: 'critical', type: 'gateway_down', site_id: f.sites[1].id });
      const expected = expectedAlerts.filter((a) => a.status === 'open' && a.severity === 'critical' && a.type === 'gateway_down'
        && f.visible.find((n) => n.id === a.nodeId).siteId === f.sites[1].id);
      assert.equal(filtered.total, expected.length); assert.equal(filtered.totals.open, expected.length); assert.equal(filtered.totals.critical, expected.length);
      const target = await alerts.listAlerts(actor, { search: m.target.node_uid, page: 1, limit: 25 }); assert.equal(target.total, 1); assert.equal(target.items[0].id, m.target.alert_id);
      assert.equal((await alerts.listAlerts(actor, { node_id: m.target.id, page: 1, limit: 25 })).total, 1);
      assert.equal((await alerts.listAlerts(emptyActor, { page: 1 })).total, 0);
      await assert.rejects(alerts.listAlerts(actor, { node_id: f.allNodes[COUNT].id, page: 1 }), (e) => e.getStatus?.() === 403);
      await assert.rejects(alerts.listAlerts(actor, { client_id: m.clients[1].id, page: 1 }), (e) => e.getStatus?.() === 403);
      const last = await alerts.listAlerts(actor, { page: 1000000, limit: 137 }); assert.equal(last.page, 9); assert.equal(last.items.length, 9);
      const empty = await alerts.listAlerts(actor, { search: `${m.run}-absent`, page: 9, limit: 25 }); assert.equal(empty.page, 1); assert.equal(empty.total, 0);
      const legacy = await alerts.listAlerts(actor, {}); assert.equal(legacy.items.length, COUNT); assert.deepEqual(legacy.totals, expectedTotals);
    });
    metrics.max_call_ms = Math.round(metrics.max_call_ms);
    Object.assign(metrics, { max_rss_mib: Math.round(metrics.max_rss / 1048576), max_heap_mib: Math.round(metrics.max_heap / 1048576),
      high_water_rss_mib: Math.round(process.resourceUsage().maxRSS / 1024), rss_growth_mib: Math.round((metrics.max_rss - baseline) / 1048576) });
    t.diagnostic(`Generic PG service metrics (not browser/load homologation): ${JSON.stringify(metrics)}`);
    m.metrics = metrics; m.state = selectedPhases.size === PHASES.length ? 'verified-service' : 'verified-selected-phases'; await storeManifest(path, m); success = true;
  } finally {
    try {
      if (seeded && !(keep && success)) {
        await cleanupSeed(db, m); m.state = success ? 'cleaned' : 'failed-cleaned'; await storeManifest(path, m);
      } else if (seeded) t.diagnostic('QA seed preserved explicitly for parent browser validation; run --cleanup afterwards.');
    } finally { await db.$disconnect(); }
  }
}

if (process.argv.includes('--guard-self-test')) guardSelfTest();
else if (process.argv.includes('--phase-self-test')) phaseSelfTest();
else {
  const raw = process.env.PAGINATION_QA_DATABASE_URL || process.env.DATABASE_URL;
  const enabled = process.env.MONITOR_QA_POSTGRES_INTEGRATION === '1';
  // Supplying an explicit QA URL without its sentinel must FAIL, never silently skip.
  const url = raw && (enabled || process.env.PAGINATION_QA_DATABASE_URL) ? validateQaUrl(raw) : null;
  if (enabled && !url) fail('An explicit QA database URL is required');
  test(process.argv.includes('--cleanup') ? 'cleanup manifest-owned pagination QA seed' : 'new compiled pagination API with isolated real PostgreSQL >1000',
    { skip: !url ? 'Opt in with guarded QA URL and sentinel; no DB touched' : false, timeout: 600000 },
    async (t) => runPg(t, url, process.argv.includes('--cleanup')));
}
