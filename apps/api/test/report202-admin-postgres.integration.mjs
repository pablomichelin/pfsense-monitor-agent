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
            if (hooks.roleRead && args[0].join(' ').includes('FROM roles') && args[0].join(' ').includes('FOR KEY SHARE')) {
              await hooks.roleRead();
            }
            return result;
          };
          if (key === 'role' && hooks.roleRead) return new Proxy(target[key], { get(model, operation) {
            if (operation === 'findUnique') return async args => {
              const role = await model.findUnique(args);
              await hooks.roleRead();
              return role;
            };
            return typeof model[operation] === 'function' ? model[operation].bind(model) : model[operation];
          } });
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

  await run('node metadata preserves concurrent partial tag edits and legacy replacements', async t => {
    const f = await fixture(t);
    const { NodeFleetMetadataService } = loadServiceModule('fleet-org/node-fleet-metadata.service');
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const site = await db.site.create({ data: { clientId: f.client.id, code: 'qa', name: f.run } });
    const node = await db.node.create({ data: { siteId: site.id, nodeUid: randomUUID(), hostname: 'qa.invalid' } });
    const [first, second] = await Promise.all(['first', 'second'].map(name =>
      db.tag.create({ data: { clientId: f.client.id, name } })));
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    const service = connection =>
      new NodeFleetMetadataService(connection, new AccessPolicyService(connection), new AuditService(connection));
    const left = service(db);
    const right = service(peer);
    const save = (editor, dto) => editor.updateNodeFleetMetadata(actor, node.id, dto, actor.userId);
    const read = async () => (await db.nodeTag.findMany({ where: { nodeId: node.id } })).map(link => link.tagId).sort();
    await Promise.all([
      save(left, { add_tag_ids: [first.id, first.id.toUpperCase()] }),
      save(right, { add_tag_ids: [second.id] }),
    ]);
    assert.deepEqual(await read(), [first.id, second.id].sort());
    await save(left, { add_tag_ids: [first.id] });
    assert.deepEqual(await read(), [first.id, second.id].sort());
    await assert.rejects(save(left, { add_tag_ids: [first.id], remove_tag_ids: [first.id.toUpperCase()] }), error => error.getStatus() === 400);
    await assert.rejects(save(left, { tag_ids: [], add_tag_ids: [first.id] }), error => error.getStatus() === 400);
    await assert.rejects(save(left, { add_tag_ids: [randomUUID()], remove_tag_ids: [first.id] }), error => error.getStatus() === 400);
    assert.deepEqual(await read(), [first.id, second.id].sort());
    await Promise.all([
      save(left, { remove_tag_ids: [first.id] }),
      save(right, { remove_tag_ids: [second.id.toUpperCase()] }),
    ]);
    assert.deepEqual(await read(), []);
    await save(left, { tag_ids: [first.id, second.id] });
    await save(right, { tag_ids: [second.id] });
    assert.deepEqual(await read(), [second.id]);
    assert.equal(await db.auditLog.count({ where: {
      targetId: node.id, action: 'fleet.node_metadata.update',
    } }), 7);
  });

  for (const entity of [
    { name: 'group', model: 'nodeGroup', service: 'GroupsService', module: 'groups.service', suffix: 'Group' },
    { name: 'tag', model: 'tag', service: 'TagsService', module: 'tags.service', suffix: 'Tag' },
  ]) {
    for (const action of ['create', 'update', 'delete']) {
      await run(`fleet catalog ${entity.name} ${action} rolls back on audit failure`, async t => {
        const f = await fixture(t);
        const { [entity.service]: CatalogService } = loadServiceModule(`fleet-org/${entity.module}`);
        const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
        const { AuditService } = loadServiceModule('audit/audit.service');
        const policy = new AccessPolicyService(db);
        const actor = { userId: f.users[0].id, role: 'superadmin' };
        const model = db[entity.model];
        const name = 'before';
        const stays = await model.create({ data: { clientId: f.client.id, name } });
        const snapshot = () => model.findMany({ where: { clientId: f.client.id }, orderBy: { id: 'asc' } });
        const prior = await snapshot();
        let invalidations = 0;
        const nodes = { invalidateFiltersCache() { invalidations++; } };
        const failure = new CatalogService(db, policy, {
          record: async () => { throw new Error('synthetic catalog audit failure'); },
        }, nodes);
        const call = service => {
          const method = service[action + entity.suffix].bind(service);
          if (action === 'create') return method(actor, { client_id: f.client.id, name: ' after ' }, actor.userId);
          if (action === 'update') return method(actor, stays.id, { name: ' after ' }, actor.userId);
          return method(actor, stays.id, actor.userId);
        };
        await assert.rejects(call(failure), /synthetic catalog audit failure/);
        assert.deepEqual(await snapshot(), prior);
        assert.equal(invalidations, 0);
        const success = new CatalogService(db, policy, new AuditService(db), nodes);
        const response = await call(success);
        assert.equal(invalidations, 1);
        const events = await db.auditLog.findMany({ where: {
          actorId: actor.userId, action: `fleet.${entity.name}.${action}`,
        } });
        assert.equal(events.length, 1);
        if (action === 'delete') {
          assert.deepEqual(response, { deleted: true, id: stays.id });
          assert.deepEqual(await snapshot(), []);
          assert.equal(events[0].metadataJson.name, name);
        } else {
          assert.equal(response[entity.name].name, 'after');
          assert.equal(events[0].targetId, response[entity.name].id);
          assert.equal(events[0].metadataJson.name, 'after');
          if (action === 'update') assert.equal(events[0].metadataJson.previous_name, name);
        }
      });
    }
  }

  await run('audit attribution uses the current role after a role change', async t => {
    const f = await fixture(t);
    const { AuditService } = loadServiceModule('audit/audit.service');
    const service = new AuditService(db);
    const record = { actorId: f.users[2].id, targetType: 'synthetic', targetId: f.client.id };
    await service.record({ ...record, action: 'qa.role.before' });
    await peer.user.update({ where: { id: record.actorId }, data: { role: 'client' } });
    await service.record({ ...record, action: 'qa.role.after' });
    await service.record({ ...record, action: 'qa.role.explicit', actorRole: 'readonly' });
    const events = await db.auditLog.findMany({ where: { actorId: record.actorId, targetId: record.targetId } });
    assert.deepEqual(Object.fromEntries(events.map(event => [event.action, event.actorRole])), {
      'qa.role.before': 'readonly',
      'qa.role.after': 'client',
      'qa.role.explicit': 'readonly',
    });
  });

  await run('lifecycle reconciles other firewalls while one is locked', async t => {
    const f = await fixture(t);
    const { NodeLifecycleService } = loadServiceModule('nodes/node-lifecycle.service');
    const { NodeCommandsService } = loadServiceModule('node-commands/node-commands.service');
    const site = await db.site.create({ data: { clientId: f.client.id, code: 'qa', name: f.run } });
    const lastSeenAt = new Date(Date.now() - 600_000);
    const nodes = await Promise.all(['a-locked', 'b-unlocked'].map(hostname => db.node.create({
      data: { siteId: site.id, nodeUid: randomUUID(), hostname, status: 'online', lastSeenAt },
    })));
    const ids = nodes.map(node => node.id);
    const client = new Proxy(db, { get(target, key) {
      if (key === 'node') return { findMany: args => target.node.findMany({
        ...args, where: { id: { in: ids } }, orderBy: { hostname: 'asc' },
      }) };
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    const events = [], alerts = [];
    const lifecycle = new NodeLifecycleService(client,
      { publishDashboardRefresh: event => events.push(event.source) },
      new NodeCommandsService(db, {}),
      { dispatchForAlertIds: ids => alerts.push(...ids) });
    const locked = f.gate(), release = f.gate();
    const writer = f.track(peer.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM nodes WHERE id = ${ids[0]}::uuid FOR UPDATE`;
      locked.resolve();
      await release.promise;
    }, { timeout: 10_000 }));
    await locked.promise;
    const reconcile = f.track(lifecycle.reconcileStatuses('interval'));
    const read = async () => (await observer.node.findMany({
      where: { id: { in: ids } }, orderBy: { hostname: 'asc' },
      select: { status: true, _count: { select: { alerts: true } } },
    })).map(node => [node.status, node._count.alerts]);
    let during;
    try {
      const completed = await Promise.race([reconcile.then(() => true), delay(1500, false)]);
      during = { completed, nodes: await read(), events: events.length, dispatched: alerts.length };
    } finally {
      release.resolve();
    }
    await writer;
    await reconcile;
    assert.deepEqual(during, {
      completed: true, nodes: [['online', 0], ['offline', 1]], events: 1, dispatched: 1,
    });
    await lifecycle.reconcileStatuses('interval');
    assert.deepEqual(await read(), [['offline', 1], ['offline', 1]]);
    assert.deepEqual(events, ['node_reconciled', 'node_reconciled']);
    assert.equal(new Set(alerts).size, 2);
  });

  await run('MFA policy storage and effective state survive a failed audit', async t => {
    const f = await fixture(t);
    const { MfaPolicyService } = loadServiceModule('mfa-policy/mfa-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const where = { id: 'default' };
    const before = await db.mfaPolicySettings.findUniqueOrThrow({ where });
    assert.deepEqual([before.enforcedRoles, before.enforcementBlocking], [[], false]);
    t.after(() => db.mfaPolicySettings.update({
      where,
      data: {
        enforcedRoles: before.enforcedRoles,
        enforcementBlocking: before.enforcementBlocking,
        updatedAt: before.updatedAt,
      },
    }));
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    const failure = new MfaPolicyService(db, {
      record: async () => { throw new Error('synthetic MFA policy audit failure'); },
    });
    await failure.refreshEffectivePolicy();
    const patch = { enforced_roles: ['readonly'] };
    await assert.rejects(failure.updatePolicy(patch, actor), /synthetic MFA policy audit failure/);
    const storedAfterError = await db.mfaPolicySettings.findUniqueOrThrow({ where });
    const effectiveAfterError = failure.getEffectivePolicySync();
    assert.deepEqual({
      stored: [storedAfterError.enforcedRoles, storedAfterError.enforcementBlocking],
      effective: [effectiveAfterError.enforcedRoles, effectiveAfterError.enforcementBlocking],
    }, { stored: [[], false], effective: [[], false] });
    const service = new MfaPolicyService(db, new AuditService(db));
    const saved = await service.updatePolicy(patch, actor);
    assert.deepEqual(saved.effective, {
      enforced_roles: ['readonly'], enforcement_blocking: false, mode: 'soft',
    });
    assert.equal(service.isEnforcementRequired('readonly', false), true);
    const events = await db.auditLog.findMany({
      where: { actorId: actor.userId, action: 'security.mfa_policy.update' },
    });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].metadataJson, {
      enforced_roles: ['readonly'], enforcement_blocking: false, mode: 'soft',
    });
  });

  await run('MFA policy concurrent partial saves keep both fields and the latest effective state', async t => {
    const f = await fixture(t);
    const { MfaPolicyService } = loadServiceModule('mfa-policy/mfa-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const where = { id: 'default' };
    const before = await db.mfaPolicySettings.findUniqueOrThrow({ where });
    assert.deepEqual([before.enforcedRoles, before.enforcementBlocking], [[], false]);
    t.after(() => db.mfaPolicySettings.update({
      where,
      data: {
        enforcedRoles: before.enforcedRoles,
        enforcementBlocking: before.enforcementBlocking,
        updatedAt: before.updatedAt,
      },
    }));
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    await db.user.update({ where: { id: actor.userId }, data: { mfaEnabled: true } });
    await db.mfaRecoveryCode.create({ data: { userId: actor.userId, codeHash: 'synthetic-only' } });
    const observed = f.gate(), resume = f.gate();
    let first = true;
    async function pauseFirst() {
      if (!first) return;
      first = false;
      observed.resolve();
      await resume.promise;
    }
    const proxy = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return async (...args) => {
        const result = await target.$transaction(...args);
        await pauseFirst();
        return result;
      };
      if (key === 'mfaPolicySettings') return new Proxy(target[key], { get(model, operation) {
        if (operation === 'upsert') return async args => {
          const row = await model.upsert(args);
          await pauseFirst();
          return row;
        };
        return typeof model[operation] === 'function' ? model[operation].bind(model) : model[operation];
      } });
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    const service = new MfaPolicyService(proxy, new AuditService(db));
    const left = f.track(service.updatePolicy({ enforced_roles: ['readonly'] }, actor));
    await observed.promise;
    try {
      await service.updatePolicy({ enforcement_blocking: true }, actor);
    } finally {
      resume.resolve();
    }
    await left;
    const stored = await db.mfaPolicySettings.findUniqueOrThrow({ where });
    assert.deepEqual([stored.enforcedRoles, stored.enforcementBlocking], [['readonly'], true]);
    assert.deepEqual(service.getEffectivePolicySync(), { enforcedRoles: ['readonly'], enforcementBlocking: true });
    const events = await db.auditLog.findMany({
      where: { actorId: actor.userId, action: 'security.mfa_policy.update' },
    });
    assert.equal(events.length, 2);
    assert.deepEqual(events.map(event => event.metadataJson.mode).sort(), ['blocking', 'soft']);
  });

  async function rolePermissionsFixture(t) {
    const f = await fixture(t);
    const { AuditService } = loadServiceModule('audit/audit.service');
    const { PermissionsService } = loadServiceModule('auth/permissions.service');
    const role = 'qa-role-' + randomUUID();
    const each = [role + '-one', role + '-two'];
    await db.role.create({ data: { code: role, label: role } });
    t.after(async () => {
      await db.role.deleteMany({ where: { code: role } });
      await db.permission.deleteMany({ where: { id: { in: each } } });
    });
    await db.permission.createMany({ data: each.map(id => ({ id, description: id })) });
    const permissions = new PermissionsService(db);
    const service = (connection, audit = new AuditService(connection), cache = permissions) =>
      new AdminService(connection, {}, {}, {}, {}, audit, cache, {}, {});
    const save = (admin, list) => admin.setRolePermissions(role, { permission_ids: list }, f.users[0].id);
    const read = () => observer.rolePermission.findMany({
      where: { role }, orderBy: { permissionId: 'asc' }, select: { permissionId: true },
    }).then(items => items.map(item => item.permissionId));
    return { ...f, role, permissions, each, service, save, read, PermissionsService, userAdmin: f.service };
  }

  await run('role permissions rollback and cache follow a committed audit', async t => {
    const f = await rolePermissionsFixture(t);
    const [first, second] = f.each;
    await db.rolePermission.create({ data: { role: f.role, permissionId: first } });
    assert.deepEqual(await f.permissions.getPermissionsForRole(f.role), [first]);
    const invalidated = t.mock.method(f.permissions, 'invalidateRoleCache');
    const failure = f.service(db, { record: async () => { throw new Error('synthetic role audit failure'); } });
    await assert.rejects(f.save(failure, [second]), /synthetic role audit failure/);
    assert.deepEqual(await f.read(), [first]);
    assert.equal(invalidated.mock.callCount(), 0);
    assert.deepEqual(await f.permissions.getPermissionsForRole(f.role), [first]);
    const ok = await f.save(f.service(db), [second, second]);
    assert.deepEqual(ok, { role: f.role, permission_ids: [second] });
    assert.equal(invalidated.mock.callCount(), 1);
    assert.deepEqual(await f.permissions.getPermissionsForRole(f.role), [second]);
    assert.equal(await db.auditLog.count({ where: { targetId: f.role, action: 'role.permissions.update' } }), 1);
  });

  await run('role permissions concurrent replacements produce one whole set', async t => {
    const f = await rolePermissionsFixture(t);
    const locked = f.gate(), release = f.gate();
    const blocker = f.track(observer.$transaction(async tx => {
      await tx.$queryRaw`SELECT code FROM roles WHERE code = ${f.role} FOR UPDATE`;
      locked.resolve();
      await release.promise;
    }, { timeout: 10_000 }));
    await locked.promise;
    const left = f.track(f.save(f.service(db), [f.each[0]]));
    const right = f.track(f.save(f.service(peer), [f.each[1]]));
    let blocked = 0;
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        const rows = await db.$queryRaw`
          SELECT pid FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND (query LIKE '%INSERT INTO "public"."role_permissions"%' OR query LIKE '%FROM roles WHERE code%')
        `;
        blocked = rows.length;
        if (blocked === 2) break;
        await delay(10);
      }
    } finally {
      release.resolve();
    }
    await blocker;
    const outcomes = await Promise.all([left, right]);
    assert.equal(blocked, 2);
    const final = await f.read();
    assert.equal(final.length, 1, 'both requests must not produce a merged set');
    assert.ok(outcomes.some(result => result.permission_ids[0] === final[0]));
    assert.equal(await db.auditLog.count({ where: { targetId: f.role, action: 'role.permissions.update' } }), 2);
  });

  await run('role permissions invalidation discards an older lookup in flight', async t => {
    const f = await rolePermissionsFixture(t);
    const [first, second] = f.each;
    await db.rolePermission.create({ data: { role: f.role, permissionId: first } });
    const snapshot = f.gate(), release = f.gate();
    let observedReads = 0;
    const readingDb = { rolePermission: {
      async findMany(args) {
        const rows = await db.rolePermission.findMany(args);
        if (++observedReads === 1) {
          snapshot.resolve();
          await release.promise;
        }
        return rows;
      },
    } };
    const cache = new f.PermissionsService(readingDb);
    const waiting = f.track(cache.getPermissionsForRole(f.role));
    await snapshot.promise;
    try {
      await f.save(f.service(peer, undefined, cache), [second]);
    } finally {
      release.resolve();
    }
    assert.deepEqual(await waiting, [second]);
    assert.deepEqual(await cache.getPermissionsForRole(f.role), [second]);
    assert.equal(observedReads, 2);
  });

  await run('role catalog creation rolls back on audit failure', async t => {
    const f = await rolePermissionsFixture(t);
    const code = 'qa-new-role-' + randomUUID();
    t.after(() => db.role.deleteMany({ where: { code } }));
    const create = admin => admin.createRole({ code, label: ' QA Role ' }, f.users[0].id);
    const failing = f.service(db, { record: async () => { throw new Error('synthetic role catalog audit'); } });
    await assert.rejects(create(failing), /synthetic role catalog audit/);
    assert.equal(await db.role.findUnique({ where: { code } }), null);
    const created = await create(f.service(db));
    assert.deepEqual(created, { role: { code, label: 'QA Role', is_system: false } });
    await assert.rejects(create(f.service(peer)), error => error.getStatus() === 409);
    assert.equal(await db.auditLog.count({ where: { targetId: code, action: 'role.create' } }), 1);
  });

  await run('role catalog deletion keeps the role and links on failed audit', async t => {
    const f = await rolePermissionsFixture(t);
    const permissionId = f.each[0];
    await db.rolePermission.create({ data: { role: f.role, permissionId } });
    assert.deepEqual(await f.permissions.getPermissionsForRole(f.role), [permissionId]);
    const invalidated = t.mock.method(f.permissions, 'invalidateRoleCache');
    const remove = admin => admin.deleteRole(f.role, f.users[0].id);
    const failing = f.service(db, { record: async () => { throw new Error('synthetic role catalog audit'); } });
    await assert.rejects(remove(failing), /synthetic role catalog audit/);
    assert.ok(await db.role.findUnique({ where: { code: f.role } }));
    assert.deepEqual(await f.read(), [permissionId]);
    assert.equal(invalidated.mock.callCount(), 0);
    const removed = await remove(f.service(db));
    assert.deepEqual(removed, { deleted: true, code: f.role });
    assert.equal(invalidated.mock.callCount(), 1);
    assert.deepEqual(await f.permissions.getPermissionsForRole(f.role), []);
    assert.deepEqual(await f.read(), []);
    assert.equal(await db.auditLog.count({ where: { targetId: f.role, action: 'role.delete' } }), 1);
  });

  await run('role assignment commits before a competing role deletion', async t => {
    const f = await rolePermissionsFixture(t);
    const read = f.gate(), release = f.gate();
    const editor = f.userAdmin(db, { async roleRead() { read.resolve(); await release.promise; } });
    const user = f.users[2];
    const assignment = f.track(editor.updateUser(user.id, { role: f.role }, f.users[0].id));
    await read.promise;
    const deletion = f.track(f.service(peer).deleteRole(f.role, f.users[0].id));
    let waiter;
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        [waiter] = await observer.$queryRaw`
          SELECT query FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%SELECT is_system%FROM roles%'
        `;
        if (waiter) break;
        await delay(10);
      }
    } finally {
      release.resolve();
    }
    const [assigned, removed] = await Promise.allSettled([assignment, deletion]);
    assert.equal(assigned.status, 'fulfilled', assigned.reason?.message);
    assert.equal(removed.status, 'rejected');
    assert.equal(removed.reason.getStatus?.(), 409);
    assert.match(waiter?.query ?? '', /FOR UPDATE/i);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role, f.role);
  });

  await run('role assignment returns a validation error when the role deletion wins', async t => {
    const f = await rolePermissionsFixture(t);
    const held = f.gate(), release = f.gate();
    const remover = f.service(peer, { async record() { held.resolve(); await release.promise; } });
    const user = f.users[2];
    const deletion = f.track(remover.deleteRole(f.role, f.users[0].id));
    await held.promise;
    const assignment = f.track(f.userAdmin(db).updateUser(user.id, { role: f.role }, f.users[0].id));
    let waiter;
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        [waiter] = await observer.$queryRaw`
          SELECT query FROM pg_stat_activity WHERE wait_event_type = 'Lock'
            AND (query LIKE '%UPDATE "public"."users"%' OR query LIKE '%FROM roles WHERE code%')
        `;
        if (waiter) break;
        await delay(10);
      }
    } finally {
      release.resolve();
    }
    const [removed, assigned] = await Promise.allSettled([deletion, assignment]);
    assert.equal(removed.status, 'fulfilled', removed.reason?.message);
    assert.equal(assigned.status, 'rejected');
    assert.equal(assigned.reason.getStatus?.(), 400, assigned.reason?.message);
    assert.match(waiter?.query ?? '', /FOR KEY SHARE/i);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role, user.role);
  });

  await run('dashboard alert counters refresh after manual acknowledgement and resolution', async t => {
    const f = await fixture(t);
    const { AlertsService } = loadServiceModule('alerts/alerts.service');
    const { DashboardService } = loadServiceModule('dashboard/dashboard.service');
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { RealtimeService } = loadServiceModule('realtime/realtime.service');
    const site = await db.site.create({ data: { clientId: f.client.id, code: 'qa', name: f.run } });
    const node = await db.node.create({ data: { siteId: site.id, nodeUid: randomUUID(), hostname: 'qa.invalid' } });
    const [first, second] = await Promise.all(['critical', 'warning'].map(severity => db.alert.create({
      data: {
        nodeId: node.id, type: 'gateway_down', severity, status: 'open', fingerprint: randomUUID(),
        title: 'Synthetic alarm', description: 'Synthetic dashboard counter', openedAt: new Date(),
      },
    })));
    const policy = new AccessPolicyService(db);
    const realtime = new RealtimeService();
    const alerts = new AlertsService(db, policy, realtime);
    const dashboard = new DashboardService(db, policy, { getPublishedVersion: () => '0.5.35' }, realtime);
    const reader = { userId: f.users[2].id, role: 'readonly' };
    const editor = { userId: f.users[0].id, role: 'superadmin' };
    const read = async () => {
      const [summary, fleet] = await Promise.all([dashboard.getSummary(reader), dashboard.getFleet(reader)]);
      return [summary.totals.open_alerts, fleet.totals.open_alerts, fleet.totals.critical_alerts];
    };
    const before = await read();
    const acknowledgement = await alerts.acknowledgeAlert(editor, first.id, editor);
    const afterAck = await read();
    const duplicate = await alerts.acknowledgeAlert(editor, first.id, editor);
    await alerts.resolveAlert(editor, second.id, { resolution_note: 'synthetic' }, editor);
    const afterResolve = await read();
    assert.deepEqual(duplicate, acknowledgement);
    assert.deepEqual({ before, afterAck, afterResolve, revisions: realtime.getDashboardRevision() }, {
      before: [2, 2, 1], afterAck: [1, 1, 0], afterResolve: [0, 0, 0], revisions: 2,
    });
  });

  await run('maintenance saves atomically and refreshes the scoped dashboard after commit', async t => {
    const f = await fixture(t);
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const { DashboardService } = loadServiceModule('dashboard/dashboard.service');
    const { RealtimeService } = loadServiceModule('realtime/realtime.service');
    const site = await db.site.create({ data: { clientId: f.client.id, code: 'qa', name: f.run } });
    const node = await db.node.create({ data: {
      siteId: site.id, nodeUid: randomUUID(), hostname: 'qa.invalid', status: 'online', lastSeenAt: new Date(),
    } });
    const policy = new AccessPolicyService(db);
    const realtime = new RealtimeService();
    const service = (connection, audit = new AuditService(connection)) =>
      new AdminService(connection, {}, {}, policy, {}, audit, {}, {}, {}, realtime);
    const editor = { userId: f.users[0].id, role: 'superadmin' };
    const reader = { userId: f.users[2].id, role: 'readonly' };
    const dashboard = new DashboardService(db, policy, { getPublishedVersion: () => '0.5.35' }, realtime);
    const read = async () => {
      const summary = await dashboard.getSummary(reader);
      return [summary.totals.online, summary.totals.maintenance];
    };
    assert.deepEqual(await read(), [1, 0]);
    const failAudit = async () => { throw new Error('synthetic maintenance audit failure'); };
    const failingConnection = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return (callback, options) => target.$transaction(tx =>
        callback(new Proxy(tx, { get(client, property) {
          if (property === 'auditLog') return { create: failAudit };
          return typeof client[property] === 'function' ? client[property].bind(client) : client[property];
        } })), options);
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    const failed = service(failingConnection, { record: failAudit });
    const save = (admin, enabled) => admin.setNodeMaintenance(node.id, enabled, editor.userId, undefined, editor);
    await assert.rejects(save(failed, true), /synthetic maintenance audit failure/);
    assert.equal((await db.node.findUniqueOrThrow({ where: { id: node.id } })).maintenanceMode, false);
    assert.equal(realtime.getDashboardRevision(), 0);
    const [first, second] = await Promise.all([save(service(db), true), save(service(peer), true)]);
    assert.ok(first.maintenance_mode && second.maintenance_mode);
    assert.deepEqual(await read(), [0, 1]);
    assert.equal(realtime.getDashboardRevision(), 1);
    await save(service(db), false);
    assert.deepEqual(await read(), [1, 0]);
    assert.equal(realtime.getDashboardRevision(), 2);
    const events = await db.auditLog.findMany({ where: { actorId: editor.userId, targetId: node.id },
      select: { action: true }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(events.map(event => event.action), ['admin.node.maintenance.enable', 'admin.node.maintenance.disable']);
  });

  async function clientCreationFixture(t) {
    const f = await fixture(t);
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const { RealtimeService } = loadServiceModule('realtime/realtime.service');
    const creator = { userId: f.users[0].id, role: 'superadmin' };
    const inherited = f.users[2].id;
    const existing = await db.client.findMany({ where: { status: 'active' }, select: { id: true } });
    await db.userClientScope.createMany({
      data: existing.map(client => ({ clientId: client.id, userId: inherited })), skipDuplicates: true,
    });
    const names = Array.from({ length: 2 }, (_, index) => 'qa-created-client-' + randomUUID() + '-' + index);
    t.after(() => db.client.deleteMany({ where: { name: { in: names } } }));
    const policy = new AccessPolicyService(db);
    const realtime = new RealtimeService();
    let invalidations = 0;
    const service = (connection, audit = new AuditService(connection)) =>
      new AdminService(connection, {}, {}, policy, { invalidateFiltersCache() { invalidations++; } },
        audit, {}, {}, {}, realtime);
    const create = (admin, index) => admin.createClient({ name: names[index] }, creator.userId, undefined, creator);
    return { ...f, creator, inherited, names, service, create, invalidations: () => invalidations };
  }

  await run('client creation rolls back the record and inherited scope if its audit fails', async t => {
    const f = await clientCreationFixture(t);
    const failAudit = async () => { throw new Error('synthetic client creation audit failure'); };
    const failingDb = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return (callback, options) => target.$transaction(tx =>
        callback(new Proxy(tx, { get(client, property) {
          if (property === 'auditLog') return { create: failAudit };
          return typeof client[property] === 'function' ? client[property].bind(client) : client[property];
        } })), options);
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    await assert.rejects(f.create(f.service(failingDb, { record: failAudit }), 0), /synthetic client creation audit failure/);
    assert.equal(await db.client.count({ where: { name: f.names[0] } }), 0);
    assert.equal(f.invalidations(), 0);
    const { client } = await f.create(f.service(db), 0);
    assert.equal(client.name, f.names[0]);
    assert.equal(f.invalidations(), 1);
    const link = await db.userClientScope.findUnique({ where: { userId_clientId: {
      userId: f.inherited, clientId: client.id,
    } } });
    assert.equal(link.grantedByUserId, f.creator.userId);
    assert.equal(await db.auditLog.count({ where: { targetId: client.id, action: 'admin.client.create' } }), 1);
  });

  await run('client creation preserves inherited access during concurrent registrations', async t => {
    const f = await clientCreationFixture(t);
    const bothInserted = f.gate();
    let inserted = 0;
    const connection = db => new Proxy(db, { get(target, key) {
      if (key === 'client') return new Proxy(target[key], { get(model, operation) {
        if (operation === 'create') return async args => {
          const client = await model.create(args);
          if (++inserted === 2) bothInserted.resolve();
          await bothInserted.promise;
          return client;
        };
        return typeof model[operation] === 'function' ? model[operation].bind(model) : model[operation];
      } });
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    const results = await Promise.all([
      f.track(f.create(f.service(connection(db)), 0)),
      f.track(f.create(f.service(connection(peer)), 1)),
    ]);
    const ids = results.map(({ client }) => client.id);
    const links = await db.userClientScope.findMany({ where: { userId: f.inherited, clientId: { in: ids } } });
    assert.deepEqual(new Set(links.map(link => link.clientId)), new Set(ids));
    assert.equal(await db.auditLog.count({ where: { targetId: { in: ids }, action: 'admin.client.create' } }), 2);
  });

  await run('client creation keeps inherited access while another client is deleted', async t => {
    const f = await clientCreationFixture(t);
    const code = 'qa-removable-' + randomUUID();
    const removable = await db.client.create({ data: { name: code, code } });
    t.after(() => db.client.deleteMany({ where: { id: removable.id, code } }));
    await db.userClientScope.create({ data: { userId: f.inherited, clientId: removable.id } });
    const observed = f.gate(), release = f.gate();
    const creatorDb = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return (work, options) => target.$transaction(tx => work(new Proxy(tx, {
        get(client, operation) {
          if (operation === 'client') return new Proxy(client.client, { get(model, method) {
            if (method === 'findMany') return async args => {
              const rows = await model.findMany(args);
              observed.resolve();
              await release.promise;
              return rows;
            };
            return typeof model[method] === 'function' ? model[method].bind(model) : model[method];
          } });
          return typeof client[operation] === 'function' ? client[operation].bind(client) : client[operation];
        },
      })), options);
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    const creation = f.track(f.create(f.service(creatorDb), 0));
    await observed.promise;
    const deletion = f.track(f.service(peer).deleteClient(removable.id, f.creator.userId, undefined, f.creator));
    let waiter;
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        [waiter] = await observer.$queryRaw`
          SELECT query FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%pg_advisory_xact_lock%'
        `;
        if (waiter) break;
        await delay(10);
      }
    } finally {
      release.resolve();
    }
    const [{ client }, removed] = await Promise.all([creation, deletion]);
    assert.equal(removed.client_id, removable.id);
    assert.equal(await db.userClientScope.count({ where: { userId: f.inherited, clientId: client.id } }), 1);
    assert.match(waiter?.query ?? '', /pg_advisory_xact_lock/i);
  });

  async function nodeCreationFixture(t) {
    const f = await fixture(t);
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const { RealtimeService } = loadServiceModule('realtime/realtime.service');
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    const policy = new AccessPolicyService(db);
    const realtime = new RealtimeService();
    let invalidations = 0;
    const service = (connection, audit = new AuditService(connection)) =>
      new AdminService(connection, { encrypt: () => 'synthetic-encrypted-fixture' }, {}, policy,
        { invalidateFiltersCache() { invalidations++; } }, audit, {}, {}, {}, realtime);
    const count = async () => Promise.all([
      db.site.count({ where: { clientId: f.client.id } }),
      db.node.count({ where: { site: { clientId: f.client.id } } }),
      db.nodeCredential.count({ where: { node: { site: { clientId: f.client.id } } } }),
    ]);
    const register = (admin, index, siteId) => admin.createNode({
      ...(siteId ? { site_id: siteId } : { client_id: f.client.id }),
      hostname: `qa-node-${index}.${f.run}.invalid`,
    }, actor.userId, undefined, actor);
    return { ...f, service, count, register, invalidations: () => invalidations, realtime };
  }

  await run('firewall registration removes its default site and credential on audit failure', async t => {
    const f = await nodeCreationFixture(t);
    const failAudit = async () => { throw new Error('synthetic firewall registration audit failure'); };
    const failingDb = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return (callback, options) => target.$transaction(tx =>
        callback(new Proxy(tx, { get(client, property) {
          if (property === 'auditLog') return { create: failAudit };
          return typeof client[property] === 'function' ? client[property].bind(client) : client[property];
        } })), options);
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    await assert.rejects(f.register(f.service(failingDb, { record: failAudit }), 1), /synthetic firewall registration audit failure/);
    assert.deepEqual(await f.count(), [0, 0, 0]);
    assert.equal(f.invalidations(), 0);
    assert.equal(f.realtime.getDashboardRevision(), 0);
    const created = await f.register(f.service(db), 1);
    assert.ok(created.bootstrap.node_secret && created.bootstrap.secret_hint);
    assert.deepEqual(await f.count(), [1, 1, 1]);
    assert.equal(f.invalidations(), 1);
    assert.equal(f.realtime.getDashboardRevision(), 1);
    const audits = await db.auditLog.count({ where: { action: 'admin.node.create', targetId: created.node.id } });
    assert.equal(audits, 1);
  });

  await run('firewall registration uses one default site under concurrent requests', async t => {
    const f = await nodeCreationFixture(t);
    const bothRead = f.gate();
    let observed = 0;
    const connection = db => new Proxy(db, { get(target, key) {
      if (key === 'client') return new Proxy(target[key], { get(model, operation) {
        if (operation === 'findUnique') return async args => {
          const result = await model.findUnique(args);
          if (args.select?.sites) {
            if (++observed === 2) bothRead.resolve();
            await bothRead.promise;
          }
          return result;
        };
        return typeof model[operation] === 'function' ? model[operation].bind(model) : model[operation];
      } });
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    const outcomes = await Promise.allSettled([
      f.track(f.register(f.service(connection(db)), 0)),
      f.track(f.register(f.service(connection(peer)), 1)),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 2);
    assert.deepEqual(await f.count(), [1, 2, 2]);
    const sites = new Set(outcomes.map(result => result.value.node.site_id));
    assert.equal(sites.size, 1);
    const [siteId] = sites;
    const explicit = await f.register(f.service(db), 2, siteId);
    assert.equal(explicit.node.site_id, siteId);
    assert.deepEqual(await f.count(), [1, 3, 3]);
    assert.equal(f.realtime.getDashboardRevision(), 3);
  });

  await run('maintenance exit restores the observed health from stored telemetry', async t => {
    const f = await fixture(t);
    const { AccessPolicyService } = loadServiceModule('auth/access-policy.service');
    const { AuditService } = loadServiceModule('audit/audit.service');
    const { NodeLifecycleService } = loadServiceModule('nodes/node-lifecycle.service');
    const { NodeCommandsService } = loadServiceModule('node-commands/node-commands.service');
    const { RealtimeService } = loadServiceModule('realtime/realtime.service');
    const site = await db.site.create({ data: { clientId: f.client.id, code: 'qa', name: f.run } });
    const now = new Date();
    const [healthy, degraded, expired, uncontacted, legacy] = await Promise.all([
      ['qa-healthy', now, true], ['qa-degraded', now, true],
      ['qa-expired', new Date(now.getTime() - 600_000), true],
      ['qa-uncontacted', null, true], ['qa-legacy', now, false],
    ].map(([hostname, lastSeenAt, maintenanceMode]) => db.node.create({
      data: { siteId: site.id, nodeUid: randomUUID(), hostname,
        status: 'maintenance', lastSeenAt, maintenanceMode },
    })));
    await db.nodeGatewayStatus.create({ data: {
      nodeId: degraded.id, gatewayName: 'QA_WAN', status: 'down', lossPercent: 100, observedAt: now,
    } });
    await db.nodeServiceStatus.create({ data: {
      nodeId: legacy.id, serviceName: 'openvpn', status: 'stopped', observedAt: now,
    } });
    const policy = new AccessPolicyService(db);
    const realtime = new RealtimeService();
    const admin = new AdminService(db, {}, {}, policy, {}, new AuditService(db), {}, {}, {}, realtime);
    const actor = { userId: f.users[0].id, role: 'superadmin' };
    const ids = [healthy, degraded, expired, uncontacted].map(node => node.id);
    const before = await Promise.all(ids.map(id => admin.setNodeMaintenance(id, false, actor.userId, undefined, actor)));
    assert.ok(before.every(result => !result.maintenance_mode));
    const read = id => db.node.findUniqueOrThrow({ where: { id }, select: { status: true } }).then(node => node.status);
    const immediately = await Promise.all(ids.map(read));
    const lifecycle = new NodeLifecycleService(db, realtime, new NodeCommandsService(db, {}), { dispatchForAlertIds() {} });
    await lifecycle.reconcileStatuses('interval');
    const legacyStatus = await read(legacy.id);
    assert.deepEqual({ immediately, legacyStatus }, {
      immediately: ['online', 'degraded', 'offline', 'unknown'],
      legacyStatus: 'degraded',
    });
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
