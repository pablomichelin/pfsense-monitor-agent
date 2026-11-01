// Synthetic defaults only. Never load .env or use DATABASE_URL for integration.
process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic';
process.env.AUTH_BOOTSTRAP_EMAIL = 'synthetic@example.invalid';
process.env.AUTH_BOOTSTRAP_PASSWORD = 'synthetic-test-only';
process.env.NODE_SECRET_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
process.env.BACKUP_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
process.env.TRUST_PROXY = 'false';

export const { AdminService } = await import('../dist/admin/admin.service.js');
export const { Prisma, PrismaClient } = await import('@prisma/client');

export function makeAdmin(prisma, { invalidate = () => {}, assertNodeAccess = async () => {} } = {}) {
  return new AdminService(
    prisma, {}, {}, { assertNodeAccess }, { invalidateFiltersCache: invalidate }, {}, {}, {}, {},
  );
}

export function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
