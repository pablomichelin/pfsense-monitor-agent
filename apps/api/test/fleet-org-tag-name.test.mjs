import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGroupName, normalizeTagName } from '../dist/fleet-org/tag-name.util.js';

test('normalizeTagName trims and collapses whitespace', () => {
  assert.equal(normalizeTagName('  edge   site  '), 'edge site');
  assert.equal(normalizeTagName('lab'), 'lab');
});

test('normalizeGroupName trims and collapses whitespace', () => {
  assert.equal(normalizeGroupName('  rollout   q3  '), 'rollout q3');
});

test('empty normalized names become empty string', () => {
  assert.equal(normalizeTagName('   '), '');
  assert.equal(normalizeGroupName('\t'), '');
});
