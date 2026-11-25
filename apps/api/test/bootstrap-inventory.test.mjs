import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NodesController } from '../dist/nodes/nodes.controller.js';

test('bootstrap inventory returns scoped installation metadata only', async () => {
  const actorChecks = [];
  const north = { id: 'client-a', name: 'QA client', node_count: 1 };
  const site = { id: 'site-a', name: 'QA site', client_id: north.id, client_name: north.name, node_count: 1 };
  const expectedNode = {
    id: 'node-a', node_uid: 'qa-node', node_uid_status: 'active', hostname: 'qa-host',
    display_name: null, client: { name: north.name }, site: { name: site.name },
    pfsense_version: '2.9', agent_version: null, last_seen_at: null,
  };
  const pagination = { total: 1, limit: 50, next_cursor: 'opaque', previous_cursor: null,
    bootstrap_summary: { pending: 1, active: 0, blocked: 0, total: 1 } };
  const controller = new NodesController({
    listNodes: async (actor, query) => {
      actorChecks.push(actor);
      assert.equal(query.client_id, north.id);
      assert.equal(query.bootstrap_bucket, 'pending');
      assert.equal(query.limit, 50);
      return { ...pagination, items: [{
        ...expectedNode, management_ip: '192.0.2.1', backup_status: 'never', tags: [],
        client: { id: north.id, name: north.name }, site: { id: site.id, name: site.name },
      }] };
    },
    getFilters: async (actor) => {
      actorChecks.push(actor);
      return { clients: [{ ...north, site_count: 1 }], sites: [{ ...site, city: 'Fixture city' }], tags: [{}] };
    },
  }, {});
  const result = await controller.getBootstrapInventory({
    client_id: north.id, bootstrap_bucket: 'pending', limit: 50,
  }, { auth: { userId: 'qa-reader', role: 'qa-role' } });
  assert.deepEqual(result, {
    nodes: { ...pagination, items: [expectedNode] },
    filters: { clients: [north], sites: [site] },
  });
  assert.equal(actorChecks.length, 2);
  assert.equal(actorChecks[0].userId, 'qa-reader');
  assert.equal(actorChecks[0], actorChecks[1]);
});
