import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdmin } from './report202-admin-test-support.mjs';
const AdminService = loadAdmin();
const repo = 'https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main';
const controller = 'https://pfs-monitor.systemup.inf.br';
const actor = { userId: 'synthetic-operator', role: 'operator' };
function fixture({ permission = true, scope = true, failAudit = false, release = {} } = {}) {
  const calls = [], audits = [];
  const node = { id: 'node', nodeUid: 'synthetic-node', hostname: 'synthetic.invalid', displayName: 'Synthetic',
    site: { code: 'SITE', client: { code: 'CLIENT' } }, credentials: [{ secretEncrypted: 'cipher', secretHint: 'hint' }] };
  const service = new AdminService(
    { node: { findUnique: async () => { calls.push('node'); return node; } } },
    { decrypt: () => { calls.push('decrypt'); return 'SYNTHETIC-SECRET'; } }, {},
    { assertOperationPermission: async (who, key) => { calls.push('permission'); assert.equal(who, actor); assert.equal(key, 'bootstrap.execute'); if (!permission) throw new Error('denied permission'); },
      assertNodeAccess: async () => { calls.push('scope'); if (!scope) throw new Error('denied scope'); } }, {},
    { record: async data => { calls.push('audit'); if (failAudit) throw new Error('audit unavailable'); audits.push(data); } }, {},
    { getPackageRelease: () => ({ version: 'synthetic-version', sha256: 'a'.repeat(64), artifact_url: `${controller}/api/v1/agent/package-artifact`, installer_url: `${repo}/packages/pfsense-package/bootstrap/install-from-release.sh`, ...release }) }, {},
  );
  const run = (base, url, who = actor) => service.getBootstrapCommand('node', base, url, 'light', 'yes', who);
  return { service, calls, audits, run };
}
test('service rejects missing actor, view-only permission and out-of-scope before decrypt', async () => {
  const noActor = fixture();
  await assert.rejects(() => noActor.service.getBootstrapCommand('node'), /actor is required/);
  assert.deepEqual(noActor.calls, []);
  for (const opts of [{ permission: false }, { scope: false }]) {
    const f = fixture(opts); await assert.rejects(() => f.run(), /denied/);
    assert.ok(!f.calls.includes('decrypt')); assert.equal(f.audits.length, 0);
  }
});
test('service validates URL overrides and package metadata before decrypt', async () => {
  for (const [base, url, release] of [
    ['http://insecure.invalid', undefined, {}],
    [undefined, 'https://unapproved.invalid', {}],
    [undefined, undefined, { sha256: 'invalid' }],
    [undefined, undefined, { installer_url: 'https://unapproved.invalid/installer.sh' }],
  ]) {
    const f = fixture({ release }); await assert.rejects(() => f.run(base, url));
    assert.ok(!f.calls.includes('decrypt')); assert.equal(f.audits.length, 0);
  }
});
test('service fail-closed audit never returns sensitive bootstrap response', async () => {
  const f = fixture({ failAudit: true });
  await assert.rejects(() => f.run(), /audit unavailable/);
  assert.deepEqual(f.calls, ['permission', 'scope', 'node', 'decrypt', 'audit']);
});
test('service retains legacy/package/uninstall contracts and writes only allowlisted metadata', async () => {
  const f = fixture();
  const result = await f.run(repo, controller);
  assert.equal(result.bootstrap.node_secret, 'SYNTHETIC-SECRET');
  assert.equal(result.heartbeat_mode, 'light');
  assert.equal(result.release.ready, true);
  assert.match(result.command, /--config-backup-enabled yes/);
  assert.match(result.package_command, /--heartbeat-mode 'light'/);
  assert.match(result.uninstall_command, /uninstall.sh/);
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].action, 'bootstrap.command.reveal');
  assert.deepEqual(f.audits[0].metadataJson, { release_version: 'synthetic-version', controller_origin: controller, override_applied: true });
  assert.ok(!JSON.stringify(f.audits).includes('SYNTHETIC-SECRET'));
  assert.ok(!JSON.stringify(f.audits).includes('install-from-release'));
});
