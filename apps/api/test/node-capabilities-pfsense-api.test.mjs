import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAccessMode,
  normalizeHeartbeatCapabilities,
} from '../dist/node-capabilities/capability-sync.util.js';
import {
  compareAliases,
  parseAliasesFromConfigXml,
} from '../dist/pfsense-api/pfsense-aliases.util.js';
import { extractPfrestAliases } from '../dist/pfsense-api/pfrest-client.js';

test('normalizeHeartbeatCapabilities maps agent report', () => {
  const normalized = normalizeHeartbeatCapabilities({
    pfrest_enabled: true,
    pfrest_version: '2.1.0',
    api_base_url: 'https://10.0.0.1',
    access_mode: 'agent',
    modules: ['pfrest', 'aliases'],
  });

  assert.equal(normalized.pfrestEnabled, true);
  assert.equal(normalized.pfrestVersion, '2.1.0');
  assert.equal(normalized.accessMode, 'agent');
  assert.deepEqual(normalized.capabilitiesJson, { modules: ['pfrest', 'aliases'] });
});

test('normalizeAccessMode falls back to unknown', () => {
  assert.equal(normalizeAccessMode('invalid'), 'unknown');
  assert.equal(normalizeAccessMode('direct'), 'direct');
});

test('parseAliasesFromConfigXml extracts alias entries', () => {
  const xml = `<?xml version="1.0"?>
<pfsense>
  <aliases>
    <alias>
      <name>LAB_HOSTS</name>
      <type>host</type>
      <address>192.168.1.10</address>
      <descr>Lab hosts</descr>
    </alias>
  </aliases>
</pfsense>`;

  const aliases = parseAliasesFromConfigXml(xml);
  assert.equal(aliases.length, 1);
  assert.equal(aliases[0]?.name, 'LAB_HOSTS');
  assert.equal(aliases[0]?.address, '192.168.1.10');
});

test('extractPfrestAliases accepts data array payload', () => {
  const aliases = extractPfrestAliases({
    data: [
      {
        name: 'API_ONLY',
        type: 'network',
        address: '10.10.10.0/24',
      },
    ],
  });

  assert.equal(aliases.length, 1);
  assert.equal(aliases[0]?.name, 'API_ONLY');
});

test('compareAliases detects only_api and match', () => {
  const comparison = compareAliases({
    apiAliases: [
      {
        name: 'SHARED',
        type: 'host',
        address: '1.1.1.1',
        description: null,
      },
      {
        name: 'API_ONLY',
        type: 'host',
        address: '2.2.2.2',
        description: null,
      },
    ],
    backupAliases: [
      {
        name: 'SHARED',
        type: 'host',
        address: '1.1.1.1',
        description: null,
      },
    ],
  });

  assert.equal(comparison.find((entry) => entry.name === 'SHARED')?.status, 'match');
  assert.equal(comparison.find((entry) => entry.name === 'API_ONLY')?.status, 'only_api');
});
