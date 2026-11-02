import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const filename = new URL('../src/admin/bootstrap-security.util.ts', import.meta.url);
const module = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(createRequire(filename), module, module.exports);
const { resolveBootstrapUrls, assertApprovedBootstrapUrl, validateBootstrapPackageRelease, bootstrapRevealAuditMetadata } = module.exports;
const base = {
  packagePublicBaseUrl: 'https://pfs-monitor.systemup.inf.br',
  packageRepoRawBase: 'https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main',
  configuredReleaseBaseUrl: 'https://downloads.example.test/agent',
};

test('official release supports controller artifact and repository installer with pinned checksum', () => {
  const urls = resolveBootstrapUrls(base);
  assert.equal(urls.overrideApplied, false);
  assert.equal(urls.controllerUrl, base.packagePublicBaseUrl);
  validateBootstrapPackageRelease({
    artifact_url: `${base.packagePublicBaseUrl}/api/v1/agent/package-artifact`,
    installer_url: `${base.packageRepoRawBase}/packages/pfsense-package/bootstrap/install-from-release.sh`,
    sha256: 'a'.repeat(64),
  }, urls.releaseBases);
  validateBootstrapPackageRelease({
    artifact_url: `${base.packageRepoRawBase}/dist/pfsense-package/package.tar.gz`,
    installer_url: `${base.packageRepoRawBase}/packages/pfsense-package/bootstrap/install-from-release.sh`,
    sha256: 'b'.repeat(64),
  }, urls.releaseBases);
});

test('approved override is explicit, HTTPS and shell arguments remain ordinary URL data', () => {
  const urls = resolveBootstrapUrls({ ...base, releaseBaseUrlOverride: "https://downloads.example.test/agent/release's" });
  assert.equal(urls.overrideApplied, true);
  assert.ok(urls.releaseBaseUrl.endsWith("release's"));
});

test('rejects alternate schemes, credentials, ports, query secrets, shared-host repos and traversal', () => {
  for (const url of [
    'http://downloads.example.test/agent', 'file:///tmp/release',
    'https://downloads.example.test.evil.test/agent', 'https://downloads.example.test:444/agent',
    'https://user:password@downloads.example.test/agent', 'https://downloads.example.test/agent?token=secret',
    'https://downloads.example.test/agent#secret', 'https://downloads.example.test/agent/../evil',
    'https://downloads.example.test/agent/%2e%2e/evil', 'https://downloads.example.test/agent/%2fetc',
    'https://downloads.example.test/agent\\evil', 'https://downloads.example.test/agent\n/evil',
    'https://raw.githubusercontent.com/attacker/repo/main',
  ]) assert.throws(() => resolveBootstrapUrls({ ...base, releaseBaseUrlOverride: url }), undefined, url);
  assert.throws(() => resolveBootstrapUrls({ ...base, controllerUrlOverride: 'https://evil.test' }));
  assert.throws(() => resolveBootstrapUrls({ ...base, controllerUrlOverride: `${base.packagePublicBaseUrl}/other` }));
  assert.throws(() => assertApprovedBootstrapUrl('https://downloads.example.test/agent-other', [base.configuredReleaseBaseUrl], 'Release'));
});

test('rejects unpinned package checksum; audit metadata uses allowlisted fields only', () => {
  assert.throws(() => validateBootstrapPackageRelease({ artifact_url: `${base.packagePublicBaseUrl}/artifact`,
    installer_url: `${base.packageRepoRawBase}/install.sh`, sha256: 'bad' }, resolveBootstrapUrls(base).releaseBases));
  const metadata = bootstrapRevealAuditMetadata({ releaseVersion: '0.5.26', controllerUrl: base.packagePublicBaseUrl,
    overrideApplied: true, command: 'secret', node_secret: 'secret' });
  assert.deepEqual(metadata, { release_version: '0.5.26', controller_origin: base.packagePublicBaseUrl, override_applied: true });
});

test('bootstrap route requires existing execute permission and forbids storage', () => {
  const source = readFileSync(new URL('../src/admin/admin.controller.ts', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("@Get('nodes/:id/bootstrap-command')"), source.indexOf("@Delete('nodes/:id')"));
  assert.match(route, /@RequirePermissions\('bootstrap.execute'\)/);
  assert.match(route, /@Header\('Cache-Control', 'no-store, private'\)/);
  assert.doesNotMatch(route, /bootstrap.view/);
});
