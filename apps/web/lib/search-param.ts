export const FIREWALL_SEARCH_MAX_LENGTH = 120;
export const ALERT_SEARCH_MAX_LENGTH = 100;
export const AUDIT_ACTOR_SEARCH_MAX_LENGTH = 120;

export function readSearchParam(value: string | string[] | undefined, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Match the API validator's character count, including presentation selectors.
  const characters = value.trim().match(/[^\uFE0E\uFE0F][\uFE0E\uFE0F]?|[\uFE0E\uFE0F]/gu);
  return characters?.slice(0, maxLength).join('') || undefined;
}
