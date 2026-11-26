import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const testDir = new URL('./', import.meta.url);
const tests = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.mjs') && !name.endsWith('.integration.test.mjs'))
  .sort()
  .map((name) => fileURLToPath(new URL(name, testDir)));
if (tests.length === 0) throw new Error('No API unit tests were found');

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic',
};
delete env.STABILIZATION_DATABASE_URL;

const run = spawnSync(process.execPath, [
  '--unhandled-rejections=strict', '--test', '--test-concurrency=4',
  ...process.argv.slice(2), ...tests,
], {
  cwd: fileURLToPath(new URL('../', testDir)),
  env,
  stdio: 'inherit',
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
