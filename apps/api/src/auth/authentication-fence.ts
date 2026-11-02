import { UnauthorizedException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

export type AuthenticationSnapshot = Pick<User,
  'id' | 'email' | 'role' | 'status' | 'passwordHash' | 'mfaEnabled' | 'mfaSecret'>;

/** Same lock order as AdminService.updateUser: administration lock, then user row. */
export async function assertAuthenticationFresh(tx: Prisma.TransactionClient, checked: AuthenticationSnapshot) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(20261102, 20201)`;
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${checked.id}::uuid FOR UPDATE`;
  const current = await tx.user.findUnique({ where: { id: checked.id } });
  // Compare security fields, not updatedAt: successful MFA itself resets failure
  // counters/updatedAt. A password reset always creates a new salted hash.
  if (!current || current.status !== 'active' ||
      current.passwordHash !== checked.passwordHash || current.email !== checked.email ||
      current.role !== checked.role || current.mfaEnabled !== checked.mfaEnabled ||
      current.mfaSecret !== checked.mfaSecret) {
    throw new UnauthorizedException('invalid credentials');
  }
}
