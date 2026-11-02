import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { isIP } from 'net';
import { PrismaService } from '../prisma/prisma.service';

export const PASSWORD_LOGIN_WINDOW_SECONDS = 300;
export const PASSWORD_LOGIN_IP_LIMIT = 60;
export const PASSWORD_LOGIN_ACCOUNT_IP_LIMIT = 10;

// Equivalent IPv6 spellings and privacy addresses in one /64 share a budget.
export function loginIpKey(address?: string): string {
  if (!address || !isIP(address) || address.includes('%')) return 'unknown';
  if (isIP(address) === 4) return address;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [left, right = ''] = canonical.split('::');
  const first = left ? left.split(':') : [];
  const last = right ? right.split(':') : [];
  const parts = canonical.includes('::')
    ? [...first, ...Array(8 - first.length - last.length).fill('0'), ...last]
    : first;
  const words = parts.map(part => parseInt(part, 16));
  if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
    return [words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join('.');
  }
  return `${words.slice(0, 4).map(word => word.toString(16)).join(':')}::/64`;
}

export function passwordLoginKeys(email: string, ipAddress?: string): [string, string] {
  const digest = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  const ip = loginIpKey(ipAddress);
  return [
    `ip:${digest([ip])}`,
    `account-ip:${digest([email.trim().toLowerCase(), ip])}`,
  ];
}

@Injectable()
export class PasswordLoginLimitService {
  private readonly logger = new Logger(PasswordLoginLimitService.name);
  constructor(private readonly prisma: PrismaService) {}

  async consume(email: string, ipAddress?: string): Promise<void> {
    const keys = passwordLoginKeys(email, ipAddress);
    let allowed: boolean;
    try {
      allowed = await this.prisma.$transaction(async tx => {
        // Always IP then account/IP. Reservations commit BEFORE password checking;
        // failed passwords cannot roll back their budget; every replica shares PG.
        for (const key of keys) {
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 20220217))`;
        }
        const limits = [PASSWORD_LOGIN_IP_LIMIT, PASSWORD_LOGIN_ACCOUNT_IP_LIMIT];
        for (let i = 0; i < keys.length; i++) {
          const [row] = await tx.$queryRaw<Array<{ attempts: number }>>`
            INSERT INTO password_login_rate_limits (rate_key, window_start, attempts)
            VALUES (${keys[i]}, clock_timestamp(), 1)
            ON CONFLICT (rate_key) DO UPDATE SET
              attempts = CASE WHEN password_login_rate_limits.window_start <=
                clock_timestamp() - ${PASSWORD_LOGIN_WINDOW_SECONDS} * interval '1 second'
                THEN 1 ELSE LEAST(password_login_rate_limits.attempts + 1, ${limits[i] + 1}) END,
              window_start = CASE WHEN password_login_rate_limits.window_start <=
                clock_timestamp() - ${PASSWORD_LOGIN_WINDOW_SECONDS} * interval '1 second'
                THEN clock_timestamp() ELSE password_login_rate_limits.window_start END
            RETURNING attempts`;
          if (row.attempts > limits[i]) return false;
        }
        // Bounded retention without a scheduler; skip rows used by other transactions.
        await tx.$executeRaw`DELETE FROM password_login_rate_limits WHERE rate_key IN (
          SELECT rate_key FROM password_login_rate_limits
          WHERE window_start < clock_timestamp() - interval '1 day'
          ORDER BY window_start LIMIT 100 FOR UPDATE SKIP LOCKED
        )`;
        return true;
      }, { maxWait: 2000, timeout: 5000 });
    } catch {
      this.logger.error(JSON.stringify({ event: 'auth.password_limit_unavailable' }));
      throw new ServiceUnavailableException('login temporarily unavailable');
    }
    if (!allowed) {
      // No account existence, email, IP, credential or key in telemetry/response.
      this.logger.warn(JSON.stringify({ event: 'auth.password_login_limited' }));
      throw new HttpException({ statusCode: 429, message: 'login temporarily unavailable',
        retry_after_seconds: PASSWORD_LOGIN_WINDOW_SECONDS }, 429);
    }
  }
}
