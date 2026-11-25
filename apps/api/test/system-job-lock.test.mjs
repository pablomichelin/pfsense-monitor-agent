import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { SystemJobLockService } from '../dist/common/system-job-lock.service.js';

function withCreateError(error) {
  return new SystemJobLockService({
    systemJobLock: {
      updateMany: async () => ({ count: 0 }),
      create: async () => { throw error; },
    },
  });
}

test('lock acquisition treats a concurrent insert as contention', async () => {
  const error = new Prisma.PrismaClientKnownRequestError('QA unique conflict', {
    code: 'P2002', clientVersion: 'synthetic',
  });
  assert.equal(await withCreateError(error).tryAcquire('qa-job', 1_000), false);
});

test('lock acquisition propagates a database failure while inserting', async () => {
  const error = new Error('QA database connection interrupted');
  await assert.rejects(withCreateError(error).tryAcquire('qa-job', 1_000), (actual) => actual === error);
});
