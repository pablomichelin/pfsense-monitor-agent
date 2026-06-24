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

  constructor(private readonly prisma: PrismaService) {}

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
      // Fail-open: indisponibilidade do banco nao deve travar a instalacao do
      // package (endpoint publico de leitura). Registra para observabilidade.
      this.logger.warn(
        `package release rate-limit indisponivel (fail-open) ip=${ip}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
      return true;
    }

    if (count > this.maxRequests) {
      throw new HttpException('rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
