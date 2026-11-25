import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { setImmediate as waitForCallbacks } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const faultMessage = (task, phase) => `synthetic DB fault ${task} ${phase}`;

async function runProbe(task, failurePhase) {
  delete process.env.STABILIZATION_DATABASE_URL;
  await import('./synthetic-env.mjs');
  process.env.COMMAND_WORKER_ENABLED = 'true';
  globalThis.fetch = async () => assert.fail('network disabled in fixture');

  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  require.extensions['.ts'] = (mod, filename) => {
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
      },
    });
    mod._compile(outputText, filename);
  };

  let onTick;
  globalThis.setInterval = (callback) => {
    onTick = callback;
    return { unref() {} };
  };
  globalThis.clearInterval = () => {};

  let phase = 'startup';
  let faults = 0;
  const completed = [];
  const failOnceInPhase = (checkedTask) => {
    if (phase === failurePhase && checkedTask === task) {
      faults++;
      throw new Error(faultMessage(task, failurePhase));
    }
  };

  const acquisitions = [];
  const releases = [];
  let service;
  if (task === 'worker') {
    const { CommandWorkerService } = require('../src/commands/command-worker.service.ts');
    const { SystemJobLockService } = require('../src/common/system-job-lock.service.ts');
    const db = {
      systemJobLock: {
        updateMany: async () => {
          acquisitions.push(phase);
          failOnceInPhase(task);
          return { count: 1 };
        },
        deleteMany: async () => {
          releases.push(phase);
          return { count: 1 };
        },
      },
      nodeCommand: {
        fields: { maxRetries: Symbol('NodeCommand.maxRetries') },
        findMany: async ({ where }) => {
          if (where.status === 'failed') completed.push(phase);
          return [];
        },
        count: async () => 0,
      },
      jobBatch: { findMany: async () => [] },
    };
    service = new CommandWorkerService(db, new SystemJobLockService(db), {});
  } else {
    const { NodeCommandsService } = require('../src/node-commands/node-commands.service.ts');
    service = new NodeCommandsService({
      nodeCommand: {
        findMany: async ({ where }) => {
          const checkedTask = where.requestedAt ? 'warning' : 'expiry';
          failOnceInPhase(checkedTask);
          completed.push([phase, checkedTask]);
          return [];
        },
      },
    }, {});
  }

  service.onModuleInit();
  try {
    await waitForCallbacks();
    assert.equal(typeof onTick, 'function');
    phase = 'interval';
    onTick();
    await waitForCallbacks();
    phase = 'recovery';
    onTick();
    await waitForCallbacks();
  } finally {
    service.onModuleDestroy();
  }

  assert.equal(faults, 1);
  if (task === 'worker') {
    assert.deepEqual(acquisitions, ['startup', 'interval', 'recovery']);
    const acquired = acquisitions.filter((seen) => seen !== failurePhase);
    assert.deepEqual(completed, acquired);
    assert.deepEqual(releases, acquired, 'only acquired locks may be released');
  } else {
    const sibling = task === 'expiry' ? 'warning' : 'expiry';
    assert.deepEqual(completed.filter(([seen]) => seen === failurePhase), [[failurePhase, sibling]]);
    assert.deepEqual(completed.filter(([seen]) => seen === 'recovery'), [
      ['recovery', 'expiry'],
      ['recovery', 'warning'],
    ]);
  }
  console.log('next scheduled cycle completed');
}

if (process.argv[2] === '--probe') {
  await runProbe(process.argv[3], process.argv[4]);
} else {
  for (const task of ['expiry', 'warning', 'worker']) {
    for (const phase of ['startup', 'interval']) {
      test(`${task} survives a DB rejection at ${phase} and executes the next cycle`, () => {
        const env = { ...process.env };
        delete env.NODE_OPTIONS;
        delete env.NODE_TEST_CONTEXT;
        const probe = spawnSync(process.execPath, [
          '--unhandled-rejections=strict',
          fileURLToPath(import.meta.url),
          '--probe',
          task,
          phase,
        ], { env, encoding: 'utf8', timeout: 15_000 });
        assert.ifError(probe.error);
        const output = probe.stdout + probe.stderr;
        assert.equal(probe.status, 0, output);
        assert.equal(output.split(faultMessage(task, phase)).length - 1, 1, output);
        assert.match(output, /next scheduled cycle completed/);
      });
    }
  }
}
