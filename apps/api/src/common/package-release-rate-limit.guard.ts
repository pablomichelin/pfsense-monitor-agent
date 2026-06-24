import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { resolveClientIp } from './client-ip';

type RateBucket = {
  count: number;
  windowStart: number;
};

@Injectable()
export class PackageReleaseRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>();
  private readonly maxRequests = 60;
  private readonly windowMs = 60_000;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    // C5: so confia em CF-Connecting-IP quando o peer e um proxy confiavel.
    const ip = resolveClientIp(request) || 'unknown';
    const now = Date.now();
    const bucket = this.buckets.get(ip);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(ip, { count: 1, windowStart: now });
      return true;
    }

    bucket.count += 1;
    if (bucket.count > this.maxRequests) {
      throw new HttpException('rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
