import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListOwnSessionsQueryDto } from './dto/list-own-sessions-query.dto';

type SessionRow = {
  id: string;
  created_at: Date;
  last_seen_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
};

/** One snapshot per response. Between pages, activity/revocation may change ordering/totals. */
export async function listOwnSessions(
  prisma: PrismaService,
  actor: { userId: string; sessionId: string },
  query: ListOwnSessionsQueryDto = {},
) {
  const view = query.view ?? 'active';
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 25;
  if (!['active', 'history', 'all'].includes(view) ||
      !Number.isInteger(page) || page < 1 || page > 2147483647 ||
      ![10, 25, 50].includes(perPage) ||
      (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 200))) {
    throw new BadRequestException('invalid session filters');
  }
  const search = (query.q ?? '').trim().toLowerCase();
  const active = Prisma.sql`revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`;
  const state = view === 'all' ? Prisma.sql`TRUE` : view === 'active'
    ? active : Prisma.sql`NOT (${active})`;
  // POSITION treats %, _ and backslash literally, like the former UI includes().
  const filter = Prisma.sql`user_id = ${actor.userId}::uuid AND (${state}) AND
    POSITION(${search} IN lower(coalesce(ip_address, '') || ' ' || coalesce(user_agent, ''))) > 0`;
  return prisma.$transaction(async tx => {
    const [counts] = await tx.$queryRaw<Array<{ total: bigint; active_count: bigint }>>(Prisma.sql`
      SELECT count(*) FILTER (WHERE ${filter}) AS total,
        count(*) FILTER (WHERE ${active}) AS active_count
      FROM user_sessions WHERE user_id = ${actor.userId}::uuid`);
    const total = Number(counts.total);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(page, totalPages);
    const rows = await tx.$queryRaw<SessionRow[]>(Prisma.sql`
      SELECT id, created_at, last_seen_at, expires_at, revoked_at, ip_address, user_agent
      FROM user_sessions WHERE ${filter}
      ORDER BY (id = ${actor.sessionId}::uuid) DESC,
        coalesce(last_seen_at, created_at) DESC, id DESC
      LIMIT ${perPage} OFFSET ${(currentPage - 1) * perPage}`);
    return {
      items: rows.map(row => ({
        ...row,
        current: row.id === actor.sessionId,
        created_at: row.created_at.toISOString(),
        last_seen_at: row.last_seen_at?.toISOString() ?? null,
        expires_at: row.expires_at.toISOString(),
        revoked_at: row.revoked_at?.toISOString() ?? null,
      })),
      total, active_count: Number(counts.active_count), page: currentPage,
      total_pages: totalPages, per_page: perPage,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
