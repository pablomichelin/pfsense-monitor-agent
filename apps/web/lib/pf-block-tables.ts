/** Tabelas de liberação. O desbloqueio não pode removê-las. */
const ALLOW_TABLES = new Set(['ips_liberados']);

export function isBlockTable(name: string): boolean {
  return !ALLOW_TABLES.has(name.trim().toLowerCase());
}

/** Only these dynamic protection tables are removed by the automatic action. */
const AUTOMATIC_BLOCK_TABLES = new Set(['sshguard', 'webconfiguratorlockout', 'sshlockout', 'virusprot', 'snort2c']);

export function isAutomaticBlockTable(name: string): boolean {
  return AUTOMATIC_BLOCK_TABLES.has(name.trim().toLowerCase());
}
