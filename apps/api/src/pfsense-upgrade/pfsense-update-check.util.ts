export const PFSENSE_UPDATE_REFRESH_MIN_AGENT = '0.5.12';
export const PFSENSE_UPDATE_FORCE_CHECK_TTL_MS = 24 * 60 * 60_000;
export const PFSENSE_UPDATE_FORCE_CHECK_COOLDOWN_MS = 2 * 60_000;

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
