export const FIREWALL_SEARCH_MAX_LENGTH = 120;
export const ALERT_SEARCH_MAX_LENGTH = 100;
export const AUDIT_ACTOR_SEARCH_MAX_LENGTH = 120;

export function readSearchParam(value: string | string[] | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return Array.from(value.trim()).slice(0, maxLength).join('') || undefined;
}
