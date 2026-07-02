import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAgentAlreadyAtTargetVersion,
  normalizePackageUpgradePayload,
} from '../dist/package-upgrade/package-upgrade.util.js';

test('normalizePackageUpgradePayload accepts valid payload', () => {
  const payload = normalizePackageUpgradePayload({
    target_version: '0.4.6',
    artifact_url: 'https://pfs-monitor.systemup.inf.br/api/v1/agent/package-artifact',
    sha256: 'a'.repeat(64),
  });

  assert.equal(payload.target_version, '0.4.6');
  assert.equal(payload.sha256, 'a'.repeat(64));
});

test('normalizePackageUpgradePayload rejects invalid sha256', () => {
  assert.throws(
    () =>
      normalizePackageUpgradePayload({
        target_version: '0.4.6',
        artifact_url: 'https://example.test/artifact',
        sha256: 'bad',
      }),
    /sha256 must be a 64-char hex string/,
  );
});

test('isAgentAlreadyAtTargetVersion compares exact semver string', () => {
  assert.equal(isAgentAlreadyAtTargetVersion('0.4.6', '0.4.6'), true);
  assert.equal(isAgentAlreadyAtTargetVersion('0.4.5', '0.4.6'), false);
  assert.equal(isAgentAlreadyAtTargetVersion(null, '0.4.6'), false);
});
