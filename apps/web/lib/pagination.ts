export function parsePage(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function currentAlertPage(page: number, count: number, perPage: number): number {
  return Math.min(page, Math.max(1, Math.ceil(count / perPage)));
}
