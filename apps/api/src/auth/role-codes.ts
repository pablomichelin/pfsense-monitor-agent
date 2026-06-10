export const SYSTEM_ROLE_CODES = [
  'superadmin',
  'admin',
  'operator',
  'readonly',
  'client',
] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];

export const SUPERADMIN_ROLE = 'superadmin';
export const CLIENT_ROLE = 'client';
export const DEFAULT_USER_ROLE = 'readonly';

export function isSuperadminRole(role: string): boolean {
  return role === SUPERADMIN_ROLE;
}

export function isClientRole(role: string): boolean {
  return role === CLIENT_ROLE;
}

export function isSystemRoleCode(code: string): boolean {
  return (SYSTEM_ROLE_CODES as readonly string[]).includes(code);
}
