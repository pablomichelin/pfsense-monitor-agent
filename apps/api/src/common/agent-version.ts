import { compare, coerce, valid } from 'semver';

export function isAgentVersionAtLeast(
  current: string | null | undefined,
  minimum: string,
): boolean {
  if (!current?.trim()) {
    return false;
  }

  const normalized = coerce(current.trim());
  if (!normalized || !valid(minimum)) {
    return false;
  }

  return compare(normalized, minimum) >= 0;
}
