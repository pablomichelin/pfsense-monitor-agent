import { ForbiddenException, Injectable } from '@nestjs/common';
import { appConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSION_KEYS, PermissionKey } from './permission-keys';
import { isSuperadminRole } from './role-codes';

@Injectable()
export class PermissionsService {
  private readonly cache = new Map<string, { permissions: string[]; expiresAt: number }>();
  private readonly cacheTtlMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  isPermissionsEnforced(): boolean {
    return appConfig.rbac.permissionsEnabled;
  }

  invalidateRoleCache(role: string): void {
    this.cache.delete(role);
  }

  invalidateAllRoleCaches(): void {
    this.cache.clear();
  }

  async getPermissionsForRole(role: string): Promise<string[]> {
    if (!this.isPermissionsEnforced()) {
      return [...PERMISSION_KEYS];
    }

    if (isSuperadminRole(role)) {
      return [...PERMISSION_KEYS];
    }

    const cached = this.cache.get(role);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const rows = await this.prisma.rolePermission.findMany({
      where: { role },
      select: { permissionId: true },
      orderBy: { permissionId: 'asc' },
    });

    const permissions = rows.map((row) => row.permissionId);
    this.cache.set(role, {
      permissions,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return permissions;
  }

  async hasPermission(role: string, permission: PermissionKey | string): Promise<boolean> {
    if (!this.isPermissionsEnforced()) {
      return true;
    }

    if (isSuperadminRole(role)) {
      return true;
    }

    const permissions = await this.getPermissionsForRole(role);
    return permissions.includes(permission);
  }

  async assertPermission(role: string, permission: PermissionKey | string): Promise<void> {
    if (!(await this.hasPermission(role, permission))) {
      throw new ForbiddenException('insufficient permission');
    }
  }
}
