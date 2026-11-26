import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditResult = 'success' | 'denied' | 'failure';

export type AuditRecordInput = {
  actorType?: string;
  actorId?: string;
  actorRole?: string | null;
  clientId?: string | null;
  action: string;
  targetType: string;
  targetId?: string;
  result?: AuditResult;
  ipAddress?: string;
  metadataJson?: Prisma.JsonObject;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActorRole(actorId?: string, db: Prisma.TransactionClient = this.prisma): Promise<string | null> {
    if (!actorId) {
      return null;
    }

    const user = await db.user.findUnique({
      where: { id: actorId },
      select: { role: true },
    });

    return user?.role ?? null;
  }

  async record(input: AuditRecordInput, db: Prisma.TransactionClient = this.prisma): Promise<void> {
    const actorRole =
      input.actorRole === undefined
        ? await this.resolveActorRole(input.actorId, db)
        : input.actorRole;

    await db.auditLog.create({
      data: {
        actorType: input.actorType ?? 'user_session',
        actorId: input.actorId,
        actorRole: actorRole ?? undefined,
        clientId: input.clientId ?? undefined,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        result: input.result ?? 'success',
        ipAddress: input.ipAddress,
        metadataJson: input.metadataJson,
      },
    });
  }

  async recordAccessDenied(input: {
    actorId: string;
    actorRole?: string;
    clientId?: string | null;
    ipAddress?: string;
    method: string;
    path: string;
    reason: string;
  }): Promise<void> {
    await this.record({
      actorId: input.actorId,
      actorRole: input.actorRole ?? null,
      clientId: input.clientId ?? null,
      action: 'access.denied',
      targetType: 'http_request',
      result: 'denied',
      ipAddress: input.ipAddress,
      metadataJson: {
        method: input.method,
        path: input.path,
        reason: input.reason,
      },
    });
  }
}
