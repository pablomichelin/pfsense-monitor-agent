import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diffConfigXml,
  detectConfigDrift,
  extractTopLevelSections,
  maskSensitiveXmlContent,
} from '../dist/backups/backups-config-diff.util.js';

const baseXml = `<?xml version="1.0"?>
<pfsense>
  <version>24.0</version>
  <system>
    <hostname>fw1</hostname>
    <password>secret-value</password>
  </system>
  <filter>
    <rule><descr>allow lan</descr></rule>
  </filter>
  <unknownsection>
    <token>abc</token>
  </unknownsection>
</pfsense>`;

test('maskSensitiveXmlContent redacts password fields', () => {
  const masked = maskSensitiveXmlContent(
    '<password>super-secret</password>',
  );
  assert.match(masked, /\[REDACTED\]/);
  assert.doesNotMatch(masked, /super-secret/);
});

test('diffConfigXml masks unknown sections fail-closed', () => {
  const result = diffConfigXml({
    fromXml: baseXml,
    toXml: baseXml.replace('<hostname>fw1</hostname>', '<hostname>fw2</hostname>'),
    fromSha256: 'a'.repeat(64),
    toSha256: 'b'.repeat(64),
  });

  const unknown = result.sections.find((section) => section.name === 'unknownsection');
  assert.ok(unknown);
  assert.equal(unknown.masked, true);
  assert.equal(result.secrets_masked, true);
  assert.ok(result.unknown_sections_masked >= 1);
});

test('diffConfigXml reports modified known section without leaking password', () => {
  const changed = baseXml.replace('<hostname>fw1</hostname>', '<hostname>fw2</hostname>');

  const result = diffConfigXml({
    fromXml: baseXml,
    toXml: changed,
    fromSha256: 'a'.repeat(64),
    toSha256: 'b'.repeat(64),
  });

  const system = result.sections.find((section) => section.name === 'system');
  assert.equal(system?.status, 'modified');
  const joined = (system?.changes ?? []).join('\n');
  assert.match(joined, /fw2/);
  assert.doesNotMatch(joined, /secret-value/);
});

test('diffConfigXml masks password-only changes as unchanged section hash', () => {
  const changed = baseXml.replace(
    '<password>secret-value</password>',
    '<password>other-secret</password>',
  );

  const result = diffConfigXml({
    fromXml: baseXml,
    toXml: changed,
    fromSha256: 'a'.repeat(64),
    toSha256: 'b'.repeat(64),
  });

  const system = result.sections.find((section) => section.name === 'system');
  assert.equal(system?.status, 'unchanged');
});

test('detectConfigDrift flags sensitive section changes', () => {
  const previousSections = extractTopLevelSections(baseXml);
  const currentSections = extractTopLevelSections(
    baseXml.replace('<descr>allow lan</descr>', '<descr>deny all</descr>'),
  );

  const drift = detectConfigDrift({
    previousSections,
    currentSections,
    previousSha256: 'a'.repeat(64),
    currentSha256: 'b'.repeat(64),
  });

  assert.equal(drift.drift, true);
  assert.deepEqual(drift.sensitive_changed_sections, ['filter']);
});

test('detectConfigDrift ignores identical hash', () => {
  const sections = extractTopLevelSections(baseXml);
  const drift = detectConfigDrift({
    previousSections: sections,
    currentSections: sections,
    previousSha256: 'same-hash',
    currentSha256: 'same-hash',
  });

  assert.equal(drift.drift, false);
  assert.deepEqual(drift.changed_sections, []);
});
