import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { resolveClientIp } from './client-ip';

@Injectable()
export class PackageReleaseRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(PackageReleaseRateLimitGuard.name);
  private readonly maxRequests = 60;
  private readonly windowMs = 60_000;
  private readonly emergencyMaxRequests = 1;
  private readonly emergencyWindowMs = 60_000;
  private readonly emergencyRateLimit = new Map<
    string,
    { count: number; windowStart: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  private checkEmergencyRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = this.emergencyRateLimit.get(ip);
    if (!entry || now - entry.windowStart >= this.emergencyWindowMs) {
      this.emergencyRateLimit.set(ip, { count: 1, windowStart: now });
      return true;
    }

    entry.count += 1;
    if (entry.count > this.emergencyMaxRequests) {
      throw new HttpException('rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    // C5: so confia em CF-Connecting-IP quando o peer e um proxy confiavel.
    const ip = resolveClientIp(request) || 'unknown';
    const now = new Date();
    const windowThreshold = new Date(now.getTime() - this.windowMs);

    let count: number;
    try {
      // C-RL: janela fixa atomica em PostgreSQL. Um unico statement reseta a
      // janela quando expirada ou incrementa o contador, evitando corrida entre
      // instancias e perda de estado em restart.
      const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
        INSERT INTO package_release_rate_limits (rate_key, window_start, count, updated_at)
        VALUES (${ip}, ${now}, 1, ${now})
        ON CONFLICT (rate_key) DO UPDATE SET
          count = CASE
            WHEN package_release_rate_limits.window_start <= ${windowThreshold} THEN 1
            ELSE package_release_rate_limits.count + 1
          END,
          window_start = CASE
            WHEN package_release_rate_limits.window_start <= ${windowThreshold} THEN ${now}
            ELSE package_release_rate_limits.window_start
          END,
          updated_at = ${now}
        RETURNING count
      `;
      count = Number(rows[0]?.count ?? 1);

      // Limpeza oportunista de janelas antigas (baixa frequencia).
      if (Math.random() < 0.01) {
        await this.prisma.packageReleaseRateLimit
          .deleteMany({ where: { windowStart: { lt: windowThreshold } } })
          .catch(() => undefined);
      }
    } catch (error) {
      this.logger.warn(
        `package release rate-limit indisponivel (fail-closed emergency) ip=${ip}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
      return this.checkEmergencyRateLimit(ip);
    }

    if (count > this.maxRequests) {
      throw new HttpException('rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
