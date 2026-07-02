import { compare, coerce, valid } from 'semver';

export type PackageVersionState =
  | 'missing'
  | 'match'
  | 'outdated'
  | 'newer'
  | 'unknown';

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

export function isPackageOutdated(
  current: string | null | undefined,
  target: string | null | undefined,
): boolean {
  const state = resolvePackageVersionState(current, target);
  return state === 'outdated' || state === 'missing';
}
