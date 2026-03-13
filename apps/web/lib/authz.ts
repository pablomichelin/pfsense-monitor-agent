export const ADMIN_ROLES = ['superadmin', 'admin'] as const;
export const SUPERADMIN_ROLES = ['superadmin'] as const;
export const ALERT_WRITE_ROLES = ['superadmin', 'admin', 'operator'] as const;

export function hasRole(
  role: string | null | undefined,
  allowedRoles: readonly string[],
): boolean {
  return Boolean(role && allowedRoles.includes(role));
}
