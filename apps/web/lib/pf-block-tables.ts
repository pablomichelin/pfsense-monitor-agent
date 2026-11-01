/** Tabelas de liberação. O desbloqueio não pode removê-las. */
const ALLOW_TABLES = new Set(['ips_liberados']);

export function isBlockTable(name: string): boolean {
  return !ALLOW_TABLES.has(name.trim().toLowerCase());
}
