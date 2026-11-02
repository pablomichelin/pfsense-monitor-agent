import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessPolicyService } from '../auth/access-policy.service';
import { getAccessActor } from '../auth/access-actor.util';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';

export class ListAdminClientsQuery {
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}

@Controller('api/v1/admin/clients')
@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
export class ClientsAdminController {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessPolicyService) {}

  @Get()
  @RequirePermissions('clients.view')
  async list(@Query() query: ListAdminClientsQuery, @Req() request: AuthenticatedRequest) {
    const allowed = await this.access.getAllowedClientIds(getAccessActor(request));
    const search = query.search?.trim();
    const where: Prisma.ClientWhereInput = {
      status: query.status ?? 'active',
      ...(allowed === null ? {} : { id: { in: allowed } }),
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    return this.prisma.$transaction(async tx => {
      const total = await tx.client.count({ where });
      const clients = await tx.client.findMany({
        where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit,
        select: { id: true, name: true, code: true, status: true, _count: { select: { sites: true } } },
      });
      const counts = clients.length ? await tx.node.groupBy({
        by: ['siteId'], where: { site: { clientId: { in: clients.map(c => c.id) } } }, _count: { _all: true },
      }) : [];
      const sites = counts.length ? await tx.site.findMany({
        where: { id: { in: counts.map(c => c.siteId) } }, select: { id: true, clientId: true },
      }) : [];
      const owner = new Map(sites.map(s => [s.id, s.clientId]));
      const nodeCounts = new Map<string, number>();
      for (const count of counts) {
        const clientId = owner.get(count.siteId)!;
        nodeCounts.set(clientId, (nodeCounts.get(clientId) ?? 0) + count._count._all);
      }
      return { items: clients.map(c => ({ id: c.id, name: c.name, code: c.code, status: c.status,
        site_count: c._count.sites, node_count: nodeCounts.get(c.id) ?? 0 })),
        total, page, limit, total_pages: Math.max(1, Math.ceil(total / limit)) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
