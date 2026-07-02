import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemJobLockService {
  private readonly logger = new Logger(SystemJobLockService.name);
  private readonly ownerId = randomUUID();

  constructor(private readonly prisma: PrismaService) {}

  async tryAcquire(lockKey: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);

    const updated = await this.prisma.systemJobLock.updateMany({
      where: {
        lockKey,
        lockedUntil: {
          lt: now,
        },
      },
      data: {
        lockedUntil,
        ownerId: this.ownerId,
      },
    });

    if (updated.count > 0) {
      return true;
    }

    try {
      await this.prisma.systemJobLock.create({
        data: {
          lockKey,
          lockedUntil,
          ownerId: this.ownerId,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async release(lockKey: string): Promise<void> {
    try {
      await this.prisma.systemJobLock.deleteMany({
        where: {
          lockKey,
          ownerId: this.ownerId,
        },
      });
    } catch (error) {
      this.logger.warn(`failed to release lock ${lockKey}: ${String(error)}`);
    }
  }
}
