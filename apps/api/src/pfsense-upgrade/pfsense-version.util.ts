import { major } from 'semver';

export function isMajorBranchBump(
  currentVersion: string | null | undefined,
  targetVersion: string | null | undefined,
): boolean {
  if (!currentVersion?.trim() || !targetVersion?.trim()) {
    return false;
  }

  try {
    return major(currentVersion) !== major(targetVersion);
  } catch {
    return false;
  }
}
