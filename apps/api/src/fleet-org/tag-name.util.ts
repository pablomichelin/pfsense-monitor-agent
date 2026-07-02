export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeGroupName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
