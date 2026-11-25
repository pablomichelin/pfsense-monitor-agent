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

function loadConfig({ systemVersion = '', useExample = false, overrides = {} } = {}) {
  const args = useExample ? [`--env-file=${example}`] : [];
  args.push('-e', "console.log(require('./dist/config/app-config.js').appConfig.systemVersion)");
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    SYSTEM_VERSION: systemVersion,
    ...overrides,
  };
  if (useExample) {
    delete env.SYSTEM_VERSION;
    delete env.TRUST_PROXY;
    delete env.TRUSTED_PROXY_IPS;
  }
  return spawnSync(process.execPath, args, { cwd: apiRoot, env, encoding: 'utf8' });
}

function readConfig(options) {
  const result = loadConfig(options);
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

const intervalKeys = [
  'NODE_RECONCILE_INTERVAL_SECONDS',
  'METRIC_SAMPLE_INTERVAL_SECONDS',
  'METRIC_HOURLY_ROLLUP_INTERVAL_SECONDS',
  'METRIC_DAILY_ROLLUP_INTERVAL_SECONDS',
  'COMMAND_WORKER_INTERVAL_SECONDS',
];

test('polling intervals reject values that would create a fast Node timer', () => {
  for (const key of intervalKeys) {
    for (const value of ['0', '-2', '0.0001', '2147484']) {
      const result = loadConfig({ overrides: { [key]: value } });
      assert.notEqual(result.status, 0, `${key}=${value} was accepted`);
      assert.match(result.stderr, new RegExp(key));
    }
  }
});

test('polling intervals accept prior valid settings and their upper boundary', () => {
  assert.equal(readConfig({ overrides: {
    NODE_RECONCILE_INTERVAL_SECONDS: '0.001',
    METRIC_SAMPLE_INTERVAL_SECONDS: '1.5',
    METRIC_HOURLY_ROLLUP_INTERVAL_SECONDS: '3600',
    METRIC_DAILY_ROLLUP_INTERVAL_SECONDS: '2147483.647',
    COMMAND_WORKER_INTERVAL_SECONDS: '60',
  } }), version);
});
