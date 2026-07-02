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

export type PackageVersionState = 'missing' | 'match' | 'outdated' | 'newer' | 'unknown';

export function resolvePackageVersionState(
  current: string | null | undefined,
  target: string | null | undefined,
): PackageVersionState {
  if (!current?.trim()) {
    return 'missing';
  }

  if (!target?.trim()) {
    return 'unknown';
  }

  const normalizedCurrent = coerce(current.trim());
  const normalizedTarget = coerce(target.trim());
  if (!normalizedCurrent || !normalizedTarget) {
    return 'unknown';
  }

  const diff = compare(normalizedCurrent, normalizedTarget);
  if (diff === 0) {
    return 'match';
  }

  return diff < 0 ? 'outdated' : 'newer';
}
