import './synthetic-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HealthController } from '../dist/health/health.controller.js';

const expectedVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

test('health reports the running version and database state without exposing a driver message', async () => {
  const controller = new HealthController({ $queryRaw: async () => [{ value: 1 }] });
  const available = await controller.getHealth();
  assert.equal(available.ok, true);
  assert.equal(available.database, 'up');
  assert.equal(available.version, expectedVersion);

  const outage = new HealthController({
    $queryRaw: async () => { throw new Error('synthetic driver connection context'); },
  });
  await assert.rejects(outage.getHealth(), error => {
    assert.equal(error.getStatus(), 503);
    const body = error.getResponse();
    assert.equal(body.ok, false);
    assert.equal(body.database, 'down');
    assert.equal(body.version, expectedVersion);
    assert.equal(body.error, 'database unavailable');
    return true;
  });
});
