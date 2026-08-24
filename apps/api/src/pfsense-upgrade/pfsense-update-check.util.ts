export const PFSENSE_UPDATE_REFRESH_MIN_AGENT = '0.5.12';
export const PFSENSE_UPDATE_REPAIR_MIN_AGENT = '0.5.13';
export const PFSENSE_UPDATE_BRANCH_MIN_AGENT = '0.5.14';
export const PFSENSE_UPDATE_BRANCH_TARGETS = ['latest', '2.8.1', '2.9.0'] as const;
export const PFSENSE_UPDATE_FORCE_CHECK_TTL_MS = 24 * 60 * 60_000;
export const PFSENSE_UPDATE_FORCE_CHECK_COOLDOWN_MS = 2 * 60_000;
export const PFSENSE_REPO_REPAIR_COOLDOWN_MS = 5 * 60_000;
export const PFSENSE_UPDATE_BRANCH_COOLDOWN_MS = 5 * 60_000;

export type PfsenseUpdateBranchTarget =
  (typeof PFSENSE_UPDATE_BRANCH_TARGETS)[number];

export function isPfsenseUpdateBranchTarget(
  value: string | null | undefined,
): value is PfsenseUpdateBranchTarget {
  return (
    value != null &&
    (PFSENSE_UPDATE_BRANCH_TARGETS as readonly string[]).includes(value)
  );
}

export function isPfsenseForceCheckPending(
  requestedAt: Date | null | undefined,
  checkedAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!requestedAt) {
    return false;
  }

  if (now.getTime() - requestedAt.getTime() > PFSENSE_UPDATE_FORCE_CHECK_TTL_MS) {
    return false;
  }

  if (checkedAt != null && checkedAt.getTime() > requestedAt.getTime()) {
    return false;
  }

  return true;
}
