/**
 * Synthetic PG17 only. Coordinator provisions/migrates the disposable database.
 * REPORT202_PG_URL=postgresql://qa@db/monitor_qa REPORT202_API_ROOT=/app REPORT202_USE_DIST=1
 *   node --test /qa/report202-admin-postgres.integration.mjs
 * Copy report202-admin-test-support.mjs beside this file. No DATABASE_URL fallback.
 * Requires an otherwise empty active-superadmin set (do not run app bootstrap).
 * Sentinel: public.report202_qa_sentinel(id=1,purpose='pfs-report202-qa-only-20261102').
 * No-env invocation skips without loading the app or connecting. Fixtures are removed.
 * Filter individual subtests via REPORT202_ADMIN_CASE after a failure; no cumulative reruns.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { loadAdmin, loadServiceModule, makeAdmin, appRequire, deferred, validateReport202Url } from './report202-admin-test-support.mjs';


const raw = process.env.REPORT202_PG_URL;
test('R202 admin PG17 guarded integration', { skip: !raw, timeout: 120000 }, async t => {
  const url = validateReport202Url(raw);
  const AdminService = loadAdmin();
  const { PrismaClient } = appRequire('@prisma/client');
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  const peer = new PrismaClient({ datasourceUrl: url.toString() });
  const observer = new PrismaClient({ datasourceUrl: url.toString() });
  const ownedRoles = [];
  t.after(async () => {
    try { for (const code of ownedRoles) await db.role.delete({ where: { code } }); }
    finally { await Promise.allSettled([db.$disconnect(), peer.$disconnect(), observer.$disconnect()]); }
  });
  const [identity] = await db.$queryRaw`SELECT current_database() AS db, current_user AS usr, current_setting('server_version_num')::int AS version`;
  assert.equal(identity.db, 'monitor_qa');
  assert.equal(identity.usr, 'qa');
  assert.ok(identity.version >= 170000 && identity.version < 180000, 'PG17 required');
  const sentinel = await db.$queryRaw`SELECT purpose FROM public.report202_qa_sentinel WHERE id = 1`;
  assert.deepEqual(sentinel.map(row => row.purpose), ['pfs-report202-qa-only-20261102']);
  assert.equal(await db.user.count({ where: { role: 'superadmin', status: 'active' } }), 0,
    'Use a fresh QA database without active superadmins; never delete unrelated users');
  for (const code of ['superadmin', 'readonly', 'client']) {
    if (!await db.role.findUnique({ where: { code } })) {
      await db.role.create({ data: { code, label: code, isSystem: true } });
      ownedRoles.push(code);
    }
  }

  async function fixture(t) {
    const run = `r202-admin-${randomUUID()}`;
    const client = await db.client.create({ data: { name: run, code: run } });
    const users = [];
    const gates = [], tasks = [];
    t.after(async () => {
      gates.forEach(gate => gate.resolve());
      await Promise.allSettled(tasks);
      const owned = await db.user.findMany({ where: { email: { endsWith: `@${run}.invalid` } }, select: { id: true } });
      const ids = owned.map(u => u.id);
      await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users.map(u => u.id) } }, { targetId: { in: ids } }] } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.client.delete({ where: { id: client.id } });
    });
    for (const [i, role] of ['superadmin', 'superadmin', 'readonly'].entries()) {
      users.push(await db.user.create({ data: { email: `${i}@${run}.invalid`, role, passwordHash: 'old', displayName: run } }));
    }
    await db.userClientScope.create({ data: { userId: users[2].id, clientId: client.id } });
    const session = await db.userSession.create({ data: { userId: users[2].id, sessionTokenHash: randomUUID(), csrfTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    const challenge = await db.mfaLoginChallenge.create({ data: { userId: users[2].id, challengeTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
    const gate = () => { const item = deferred(); gates.push(item); return item; };
    const track = promise => { tasks.push(promise); promise.catch(() => {}); return promise; };
    const service = (connection = db, hooks = {}) => makeAdmin(AdminService, {
      $transaction: (callback, options) => connection.$transaction(async tx => {
        const [pid] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
        hooks.pid?.resolve(pid.pid);
        const wrapped = new Proxy(tx, { get(target, key) {
          if (key === '$queryRaw') return async (...args) => {
            const advisory = String(args[0][0]).includes('pg_advisory_xact_lock');
            if (advisory) hooks.atLock?.resolve();
            const result = await target.$queryRaw(...args);
            if (advisory && hooks.locked) { hooks.locked.resolve(); await hooks.release.promise; }
            return result;
          };
          if (['auditLog', 'userClientScope', 'user', 'userSession'].includes(key)) return new Proxy(target[key], { get(model, operation) {
            if ((hooks.fail === 'audit' && key === 'auditLog' && operation === 'create') ||
                (hooks.fail === 'scope' && key === 'userClientScope' && operation === 'createMany') ||
                (hooks.fail === 'delete' && key === 'user' && operation === 'delete')) {
              return async () => { throw new Error(`injected ${hooks.fail}`); };
            }
            if (hooks.beforeCas && key === 'userSession' && operation === 'updateMany') {
              return async (...args) => { await hooks.beforeCas(); return model[operation](...args); };
            }
            return typeof model[operation] === 'function' ? model[operation].bind(model) : model[operation];
          } });
          return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        } });
        const result = await callback(wrapped);
        if (hooks.fail === 'precommit') throw new Error('injected precommit');
        return result;
      }, { ...options, timeout: 15000, maxWait: 5000 }),
    });
    const snapshot = async () => ({
      users: await db.user.findMany({ where: { email: { endsWith: `@${run}.invalid` } }, orderBy: { id: 'asc' } }),
      scopes: await db.userClientScope.findMany({ where: { clientId: client.id }, orderBy: { userId: 'asc' } }),
      sessions: await db.userSession.findMany({ where: { userId: { in: users.map(u => u.id) } }, orderBy: { id: 'asc' } }),
      challenges: await db.mfaLoginChallenge.findMany({ where: { userId: { in: users.map(u => u.id) } }, orderBy: { id: 'asc' } }),
      audit: await db.auditLog.findMany({ where: { actorId: { in: users.map(u => u.id) } }, orderBy: { id: 'asc' } }),
    });
    return { run, users, client, session, challenge, gate, track, service, snapshot };
  }
  const selected = process.env.REPORT202_ADMIN_CASE;
  const run = (name, callback) => t.test(name, { skip: !!selected && !name.includes(selected) }, callback);

  await run('group membership rejects an outdated full replacement and rolls back an audit failure', async t => {
    const f = await fixture(t);
    const { GroupsService } = loadServiceModule('fleet-org/groups.service');
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const service = (connection, audit = new AuditService(connection)) =>
      new GroupsService(connection, new AccessPolicyService(connection), audit, { invalidateFiltersCache() {} });
    const left = service(db);
    const right = service(peer);
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    const site = await db.site.create({ data: { clientId: f.client.id, code: 'qa', name: f.run } });
    const group = await db.nodeGroup.create({ data: { clientId: f.client.id, name: f.run } });
    const ids = Array.from({ length: 53 }, () => randomUUID());
    await db.node.createMany({ data: ids.map((id, index) => ({
      id, siteId: site.id, nodeUid: randomUUID(), hostname: `qa-${String(index).padStart(3, '0')}.invalid`,
    })) });
    const original = ids.slice(0, 50);
    await left.setGroupMembers(actor, group.id, { node_ids: original }, actor.userId);
    const before = await left.getGroupById(actor, group.id);
    assert.match(before.membership_revision, /^[0-9a-f]{64}$/);
    const save = (editor, memberIds, expected) => editor.setGroupMembers(actor, group.id, {
      node_ids: memberIds, expected_revision: expected,
    }, actor.userId);
    const outcomes = await Promise.allSettled([
      save(left, [...original, ids[50]], before.membership_revision),
      save(right, [...original, ids[51]], before.membership_revision),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    const conflict = outcomes.find(result => result.status === 'rejected').reason;
    assert.equal(conflict.getStatus(), 409);
    assert.equal(conflict.getResponse().code, 'GROUP_MEMBERS_CHANGED');
    const current = await right.getGroupById(actor, group.id);
    assert.equal(current.members.length, 51);
    assert.equal(outcomes.find(result => result.status === 'fulfilled').value.membership_revision, current.membership_revision);
    const failing = service(peer, { record: async () => { throw new Error('synthetic group audit failure'); } });
    await assert.rejects(save(failing, ids, current.membership_revision), /synthetic group audit failure/);
    assert.equal((await left.getGroupById(actor, group.id)).membership_revision, current.membership_revision);
    const saved = await save(right, ids, current.membership_revision);
    assert.equal(saved.member_count, 53);
    assert.equal(await db.auditLog.count({ where: { targetId: group.id, action: 'fleet.group.members.set' } }), 3);
  });

  await run('group membership save uses the same client-first lock order as client deletion', async t => {
    const f = await fixture(t);
    const { GroupsService } = loadServiceModule('fleet-org/groups.service');
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const client = await db.client.create({ data: { name: f.run, code: f.run + '-empty' } });
    t.after(() => db.client.deleteMany({ where: { id: client.id } }));
    const group = await db.nodeGroup.create({ data: { clientId: client.id, name: f.run } });
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    const reachedAudit = f.gate();
    const releaseAudit = f.gate();
    const deletePid = f.gate();
    const audit = new AuditService(db);
    const groups = new GroupsService(db, new AccessPolicyService(db), {
      async record(data, tx) {
        reachedAudit.resolve();
        await releaseAudit.promise;
        await audit.record(data, tx);
      },
    }, { invalidateFiltersCache() {} });
    const before = await groups.getGroupById(actor, group.id);
    const save = f.track(groups.setGroupMembers(actor, group.id, {
      node_ids: [], expected_revision: before.membership_revision,
    }, actor.userId));
    await reachedAudit.promise;
    const deletion = f.track(peer.$transaction(async tx => {
      const [connection] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      deletePid.resolve(connection.pid);
      await tx.$queryRaw`SELECT id FROM clients WHERE id = ${client.id}::uuid FOR UPDATE`;
      await tx.client.delete({ where: { id: client.id } });
    }, { timeout: 15_000 }));
    const pid = await deletePid.promise;
    let blocked;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        [blocked] = await observer.$queryRaw`
          SELECT query FROM pg_stat_activity
          WHERE pid = ${pid}::int AND cardinality(pg_blocking_pids(pid)) > 0
        `;
        if (blocked) break;
        await delay(10);
      }
    } finally {
      releaseAudit.resolve();
    }
    const outcomes = await Promise.allSettled([save, deletion]);
    assert.deepEqual(outcomes.map(result => result.status === 'fulfilled'
      ? 'fulfilled'
      : (result.reason.code ?? result.reason.message)), ['fulfilled', 'fulfilled']);
    assert.match(blocked?.query ?? '', /SELECT id FROM clients .* FOR UPDATE/i);
    assert.equal(await db.nodeGroup.count({ where: { id: group.id } }), 0);
  });

  await run('group membership detects a firewall removed during a save', async t => {
    const f = await fixture(t);
    const { GroupsService } = loadServiceModule('fleet-org/groups.service');
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const site = await db.site.create({ data: { clientId: f.client.id, code: 'qa', name: f.run } });
    const node = await db.node.create({ data: { siteId: site.id, nodeUid: randomUUID(), hostname: 'qa.invalid' } });
    const group = await db.nodeGroup.create({ data: { clientId: f.client.id, name: f.run } });
    await db.nodeGroupMember.create({ data: { groupId: group.id, nodeId: node.id } });
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    const editorPid = f.gate(), deleteLocked = f.gate(), allowDelete = f.gate();
    const editorPrisma = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return (callback, options) => target.$transaction(async tx => {
        const [connection] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
        editorPid.resolve(connection.pid);
        return callback(tx);
      }, options);
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    const groups = new GroupsService(editorPrisma, new AccessPolicyService(db), new AuditService(db), {
      invalidateFiltersCache() {},
    });
    const before = await groups.getGroupById(actor, group.id);
    const deletion = f.track(peer.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM nodes WHERE id = ${node.id}::uuid FOR UPDATE`;
      deleteLocked.resolve();
      await allowDelete.promise;
      await tx.node.delete({ where: { id: node.id } });
    }, { timeout: 15_000 }));
    await deleteLocked.promise;
    const save = f.track(groups.setGroupMembers(actor, group.id, {
      node_ids: [node.id], expected_revision: before.membership_revision,
    }, actor.userId));
    const pid = await editorPid.promise;
    let blocked;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        [blocked] = await observer.$queryRaw`
          SELECT query FROM pg_stat_activity
          WHERE pid = ${pid}::int AND cardinality(pg_blocking_pids(pid)) > 0
        `;
        if (blocked) break;
        await delay(10);
      }
    } finally {
      allowDelete.resolve();
    }
    const [deleted, edited] = await Promise.allSettled([deletion, save]);
    assert.equal(deleted.status, 'fulfilled', deleted.reason?.message);
    assert.equal(edited.status, 'rejected');
    assert.equal(edited.reason.getStatus?.(), 409, edited.reason?.message);
    assert.equal(edited.reason.getResponse().code, 'GROUP_MEMBERS_CHANGED');
    assert.match(blocked?.query ?? '', /FOR KEY SHARE OF n/i);
    assert.equal((await groups.getGroupById(actor, group.id)).members.length, 0);
    assert.equal(await db.auditLog.count({ where: { targetId: group.id, action: 'fleet.group.members.set' } }), 0);
  });

  await run('node metadata rolls back criticality and tags when its audit fails', async t => {
    const f = await fixture(t);
    const { NodeFleetMetadataService } = loadServiceModule('fleet-org/node-fleet-metadata.service');
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const site = await db.site.create({ data: { clientId: f.client.id, code: 'qa', name: f.run } });
    const node = await db.node.create({ data: { siteId: site.id, nodeUid: randomUUID(), hostname: 'qa.invalid' } });
    const [originalTag, replacement] = await Promise.all(['original', 'replacement'].map(name =>
      db.tag.create({ data: { clientId: f.client.id, name } })));
    await db.nodeTag.create({ data: { nodeId: node.id, tagId: originalTag.id } });
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    const update = { criticality: 'critical', tag_ids: [replacement.id, replacement.id] };
    const policy = new AccessPolicyService(db);
    const failure = new NodeFleetMetadataService(db, policy, {
      record: async () => { throw new Error('synthetic metadata audit failure'); },
    });
    await assert.rejects(failure.updateNodeFleetMetadata(actor, node.id, update, actor.userId), /synthetic metadata audit failure/);
    const current = await db.node.findUniqueOrThrow({ where: { id: node.id }, include: { nodeTags: true } });
    assert.deepEqual({ criticality: current.criticality, tags: current.nodeTags.map(link => link.tagId) }, {
      criticality: node.criticality, tags: [originalTag.id],
    });
    const service = new NodeFleetMetadataService(db, policy, new AuditService(db));
    const saved = await service.updateNodeFleetMetadata(actor, node.id, update, actor.userId);
    assert.equal(saved.criticality, 'critical');
    assert.deepEqual(saved.tags, [{ id: replacement.id, name: replacement.name }]);
    const events = await db.auditLog.findMany({ where: { action: 'fleet.node_metadata.update', targetId: node.id } });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].metadataJson, {
      previous_criticality: node.criticality,
      criticality: 'critical',
      previous_tag_ids: [originalTag.id],
      tag_ids: [replacement.id],
      node_status_unchanged: true,
    });
  });

  await run('node metadata detects a tag removed while saving', async t => {
    const f = await fixture(t);
    const { NodeFleetMetadataService } = loadServiceModule('fleet-org/node-fleet-metadata.service');
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const site = await db.site.create({ data: { clientId: f.client.id, code: 'qa', name: f.run } });
    const node = await db.node.create({ data: { siteId: site.id, nodeUid: randomUUID(), hostname: 'qa.invalid' } });
    const tag = await db.tag.create({ data: { clientId: f.client.id, name: 'remove-in-flight' } });
    await db.nodeTag.create({ data: { nodeId: node.id, tagId: tag.id } });
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    const deletingPid = f.gate(), allowDelete = f.gate();
    const deletion = f.track(peer.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tags WHERE id = ${tag.id}::uuid FOR UPDATE`;
      const [connection] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      deletingPid.resolve(connection.pid);
      await allowDelete.promise;
      await tx.tag.delete({ where: { id: tag.id } });
    }, { timeout: 15_000 }));
    const pid = await deletingPid.promise;
    const service = new NodeFleetMetadataService(db, new AccessPolicyService(db), new AuditService(db));
    const save = f.track(service.updateNodeFleetMetadata(actor, node.id, {
      criticality: 'critical', tag_ids: [tag.id],
    }, actor.userId));
    let blocked;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        [blocked] = await observer.$queryRaw`
          SELECT query FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pg_stat_activity.pid))
        `;
        if (blocked) break;
        await delay(10);
      }
    } finally {
      allowDelete.resolve();
    }
    const [deleted, edited] = await Promise.allSettled([deletion, save]);
    assert.equal(deleted.status, 'fulfilled', deleted.reason?.message);
    assert.equal(edited.status, 'rejected');
    assert.equal(edited.reason.getStatus?.(), 400, edited.reason?.message);
    assert.match(blocked?.query ?? '', /FROM tags.*FOR KEY SHARE/is);
    const current = await db.node.findUniqueOrThrow({ where: { id: node.id }, include: { nodeTags: true } });
    assert.equal(current.criticality, node.criticality);
    assert.deepEqual(current.nodeTags, []);
    assert.equal(await db.auditLog.count({ where: { targetId: node.id, action: 'fleet.node_metadata.update' } }), 0);
  });

  for (const pair of [['inactive', 'inactive'], ['demote', 'delete'], ['delete', 'delete']]) {
    await run(`race ${pair.join('/')}`, async t => {
      const f = await fixture(t), locked = f.gate(), release = f.gate(), pid = f.gate(), atLock = f.gate();
      const apply = (service, action, target, actor) => action === 'delete' ? service.deleteUser(target.id, actor.id)
        : service.updateUser(target.id, action === 'inactive' ? { status: 'inactive' } : { role: 'readonly' }, actor.id);
      const first = f.track(apply(f.service(db, { locked, release }), pair[0], f.users[0], f.users[1]));
      await locked.promise;
      const second = f.track(apply(f.service(peer, { pid, atLock }), pair[1], f.users[1], f.users[0]));
      await atLock.promise;
      const blockedPid = await pid.promise;
      let observed = false;
      for (let i = 0; i < 150; i++) {
        const [row] = await observer.$queryRaw`SELECT cardinality(pg_blocking_pids(${blockedPid}::int)) > 0 AS blocked`;
        if (row.blocked) { observed = true; break; }
        await delay(10);
      }
      release.resolve();
      const outcomes = await Promise.allSettled([first, second]);
      assert.ok(observed, 'second connection must wait for the common advisory lock');
      assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
      assert.match(outcomes.find(x => x.status === 'rejected').reason.message, /last active superadmin/);
      assert.equal(await db.user.count({ where: { role: 'superadmin', status: 'active' } }), 1);
    });
  }
  for (const fail of ['audit', 'precommit', 'scope', 'delete']) {
    for (const operation of (fail === 'scope' ? ['create', 'update', 'scopes'] : fail === 'delete' ? ['delete'] : ['create', 'update', 'delete', 'scopes', 'revoke'])) {
      await run(`rollback ${operation}/${fail}`, async t => {
        const f = await fixture(t), admin = f.users[0], user = f.users[2], service = f.service(db, { fail });
        const before = await f.snapshot();
        const operations = {
          create: () => service.createUser({ email: `new@${f.run}.invalid`, password: 'new-password', role: 'readonly', client_ids: [f.client.id] }, admin.id),
          update: () => service.updateUser(user.id, { password: 'new-password', client_ids: [f.client.id] }, admin.id),
          delete: () => service.deleteUser(user.id, admin.id),
          scopes: () => service.setUserClientScopes(user.id, { client_ids: [f.client.id] }, admin.id),
          revoke: () => service.revokeUserSession(user.id, f.session.id, { actorId: admin.id, actorSessionId: randomUUID() }),
        };
        await assert.rejects(operations[operation], new RegExp(`injected ${fail}`));
        assert.deepEqual(await f.snapshot(), before);
      });
    }
  }
  await run('reset commits and ordinary edits preserve sessions', async t => {
    const f = await fixture(t), service = f.service();
    await service.updateUser(f.users[2].id, { display_name: 'renamed' }, f.users[0].id);
    assert.equal((await db.userSession.findUnique({ where: { id: f.session.id } })).revokedAt, null);
    await service.updateUser(f.users[2].id, { password: 'new-password' }, f.users[0].id);
    assert.ok((await db.userSession.findUnique({ where: { id: f.session.id } })).revokedAt);
    assert.ok((await db.mfaLoginChallenge.findUnique({ where: { id: f.challenge.id } })).consumedAt);
    const audit = await db.auditLog.findMany({ where: { actorId: f.users[0].id } });
    assert.equal(audit.filter(x => x.metadataJson.password_rotated).length, 1);
    assert.ok(!JSON.stringify(audit).includes('new-password'));
  });
  await run('revoke CAS concurrent requests audit once with identical result', async t => {
    const f = await fixture(t), barrier = f.gate();
    let arrivals = 0;
    const beforeCas = async () => { if (++arrivals === 2) barrier.resolve(); await barrier.promise; };
    const actor = { actorId: f.users[0].id, actorSessionId: randomUUID() };
    const results = await Promise.all([db, peer].map(connection => f.track(f.service(connection, { beforeCas }).revokeUserSession(f.users[2].id, f.session.id, actor))));
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(await f.service().revokeUserSession(f.users[2].id, f.session.id, actor), results[0]);
    assert.equal(await db.auditLog.count({ where: { targetId: f.session.id, action: 'admin.user_session.revoke' } }), 1);
  });
  await run('pagination 1105 users and 205 sessions, search status MFA scopes current session', async t => {
    const f = await fixture(t), service = f.service();
    const data = Array.from({ length: 1105 }, (_, i) => ({ email: `page${String(i).padStart(4, '0')}@${f.run}.invalid`, displayName: `${f.run} Page`, role: 'readonly' }));
    await db.user.createMany({ data });
    await db.user.createMany({ data: Array.from({ length: 3 }, (_, i) => ({ email: `inactive${i}@${f.run}.invalid`, role: 'readonly', status: 'inactive' })) });
    const pageUser = await db.user.findUnique({ where: { email: data[0].email } });
    await db.user.update({ where: { id: pageUser.id }, data: { mfaEnabled: true } });
    await db.mfaRecoveryCode.createMany({ data: [0, 1, 2].map(i => ({ userId: pageUser.id, codeHash: randomUUID(), usedAt: i === 2 ? new Date() : null })) });
    await db.userClientScope.create({ data: { userId: pageUser.id, clientId: f.client.id } });
    const seen = new Set(); let cursor;
    const started = performance.now();
    do {
      const page = await service.listUsers({ search: `${f.run} Page`, cursor, limit: 200 });
      assert.equal(page.total, 1105); assert.ok(page.items.length <= 200);
      for (const item of page.items) {
        assert.ok(!seen.has(item.id)); seen.add(item.id);
        if (item.id === pageUser.id) { assert.equal(item.mfa_recovery_codes_remaining, 2); assert.deepEqual(item.client_ids, [f.client.id]); }
        assert.ok(!('passwordHash' in item));
      }
      cursor = page.next_cursor || undefined;
    } while (cursor);
    assert.equal(seen.size, 1105);
    assert.equal((await service.listUsers({ search: f.run, status: 'inactive' })).total, 3);
    assert.equal((await service.listUsers({ search: 'no-matches-synthetic' })).total, 0);
    assert.equal((await service.listUsers({ search: `${f.run} Page` })).items.length, 50);
    await assert.rejects(() => service.listUsers({ search: `${f.run} Page`, cursor: f.users[0].id }), /cursor/);
    await db.userSession.createMany({ data: Array.from({ length: 204 }, () => ({ userId: f.users[2].id, sessionTokenHash: randomUUID(), csrfTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) })) });
    const sessions = []; cursor = undefined;
    do {
      const page = await service.listUserSessions(f.users[2].id, { actorSessionId: f.session.id, limit: 50, cursor });
      assert.equal(page.total, 205); sessions.push(...page.items); cursor = page.next_cursor || undefined;
    } while (cursor);
    assert.equal(new Set(sessions.map(s => s.id)).size, 205);
    assert.equal(sessions.filter(s => s.current).length, 1);
    await assert.rejects(() => service.listUserSessions(f.users[0].id, { actorSessionId: '', cursor: f.session.id }), /cursor/);
    console.log(`R202 pagination fixture: 1105 users / 205 sessions, ${Math.round(performance.now() - started)} ms (functional timing, not P95 benchmark)`);
  });
});
