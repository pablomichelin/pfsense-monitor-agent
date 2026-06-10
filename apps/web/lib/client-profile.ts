export const CLIENT_ROLE = 'client';

export function isClientRole(role: string | null | undefined): boolean {
  return role === CLIENT_ROLE;
}
