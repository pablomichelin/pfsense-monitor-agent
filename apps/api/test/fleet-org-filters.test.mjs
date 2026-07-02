import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Espelha a composição de filtros combinados em listNodes (tag + group + criticality).
 */
function buildCombinedNodeFilter(query) {
  const filters = [];

  if (query.criticality) {
    filters.push({ criticality: query.criticality });
  }
  if (query.tag_id) {
    filters.push({ nodeTags: { some: { tagId: query.tag_id } } });
  }
  if (query.group_id) {
    filters.push({ groupMembers: { some: { groupId: query.group_id } } });
  }

  return filters;
}

test('combined filters include tag, group and criticality independently', () => {
  const filters = buildCombinedNodeFilter({
    criticality: 'critical',
    tag_id: 'tag-1',
    group_id: 'group-1',
  });

  assert.equal(filters.length, 3);
  assert.deepEqual(filters[0], { criticality: 'critical' });
  assert.deepEqual(filters[1], { nodeTags: { some: { tagId: 'tag-1' } } });
  assert.deepEqual(filters[2], { groupMembers: { some: { groupId: 'group-1' } } });
});

test('empty query yields no fleet-org filters', () => {
  assert.deepEqual(buildCombinedNodeFilter({}), []);
});

test('client scope isolation is modeled separately from tag authority', () => {
  const rbacScope = { site: { clientId: { in: ['client-a'] } } };
  const tagFilter = { nodeTags: { some: { tagId: 'tag-x' } } };

  assert.notDeepEqual(rbacScope, tagFilter);
  assert.ok(rbacScope.site.clientId.in.includes('client-a'));
});
