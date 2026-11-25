import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(apiRoot, 'package.json'), 'utf8'));
const example = path.join(apiRoot, '../../.env.api.example');

function readConfig({ systemVersion = '', useExample = false } = {}) {
  const args = useExample ? [`--env-file=${example}`] : [];
  args.push('-e', "console.log(require('./dist/config/app-config.js').appConfig.systemVersion)");
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    SYSTEM_VERSION: systemVersion,
  };
  if (useExample) {
    delete env.SYSTEM_VERSION;
    delete env.TRUST_PROXY;
    delete env.TRUSTED_PROXY_IPS;
  }
  const result = spawnSync(process.execPath, args, { cwd: apiRoot, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('API defaults to its built package version', () => {
  assert.equal(readConfig(), version);
});

test('API permits the explicit system version override', () => {
  assert.equal(readConfig({ systemVersion: '9.9.9-qa' }), '9.9.9-qa');
});

test('the example supplies a valid proxy configuration for a fresh install', () => {
  assert.equal(readConfig({ useExample: true }), version);
});
