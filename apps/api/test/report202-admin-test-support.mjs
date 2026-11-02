import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const apiRoot = process.env.REPORT202_API_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const appRequire = createRequire(resolve(apiRoot, 'package.json'));

// No dotenv, app bootstrap, network or production defaults. Prisma is explicitly injected.
export function loadAdmin() {
  process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic';
  process.env.AUTH_BOOTSTRAP_EMAIL = 'synthetic@example.invalid';
  process.env.AUTH_BOOTSTRAP_PASSWORD = 'Synthetic-test-only-2026!';
  process.env.NODE_SECRET_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
  process.env.BACKUP_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
  if (process.env.REPORT202_USE_DIST === '1') return appRequire(resolve(apiRoot, 'dist/admin/admin.service.js')).AdminService;
  const ts = appRequire('typescript');
  const previous = Module._extensions['.ts'];
  Module._extensions['.ts'] = (mod, filename) => {
    const result = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true, emitDecoratorMetadata: false, esModuleInterop: true },
    });
    mod._compile(result.outputText, filename);
  };
  try { return appRequire(resolve(apiRoot, 'src/admin/admin.service.ts')).AdminService; }
  finally {
    if (previous) Module._extensions['.ts'] = previous;
    else delete Module._extensions['.ts'];
  }
}

export function makeAdmin(AdminService, prisma) {
  return new AdminService(prisma, {}, { createUserPasswordHash: async password => `synthetic-hash:${password}` },
    {}, {}, { record: async () => { throw new Error('audit escaped transaction'); } }, {}, {},
    { isEnforcementRequired: () => false });
}

export function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

export function validateReport202Url(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid REPORT202_PG_URL (value suppressed)'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL URL required');
  assert.equal(decodeURIComponent(url.pathname), '/monitor_qa');
  assert.equal(decodeURIComponent(url.username), 'qa');
  assert.equal(url.hash, '');
  for (const [key, value] of url.searchParams) {
    assert.ok((['connection_limit', 'connect_timeout', 'pool_timeout'].includes(key) && /^[1-9][0-9]?$/.test(value)) ||
      (key === 'schema' && value === 'public'), 'Unexpected URL routing/options parameter');
  }
  url.searchParams.set('connection_limit', '6');
  url.searchParams.set('connect_timeout', '5');
  return url;
}
