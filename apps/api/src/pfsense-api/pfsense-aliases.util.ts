import { extractTopLevelSections } from '../backups/backups-config-diff.util';

export type ConfigXmlAliasRecord = {
  name: string;
  type: string;
  address: string;
  description: string | null;
};

export function parseAliasesFromConfigXml(xml: string): ConfigXmlAliasRecord[] {
  const sections = extractTopLevelSections(xml);
  const aliasesSection = sections.get('aliases') ?? '';
  if (!aliasesSection.trim()) {
    return [];
  }

  const aliases: ConfigXmlAliasRecord[] = [];
  const aliasRegex = /<alias>([\s\S]*?)<\/alias>/gi;
  let match: RegExpExecArray | null;

  while ((match = aliasRegex.exec(aliasesSection)) !== null) {
    const block = match[1] ?? '';
    const name = readXmlTag(block, 'name');
    if (!name) {
      continue;
    }

    aliases.push({
      name,
      type: readXmlTag(block, 'type') || 'unknown',
      address: readXmlTag(block, 'address') || readXmlTag(block, 'addressip') || '',
      description: readXmlTag(block, 'descr') || null,
    });
  }

  return aliases.sort((a, b) => a.name.localeCompare(b.name));
}

function readXmlTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  if (!match?.[1]) {
    return '';
  }
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
}

export type AliasComparisonEntry = {
  name: string;
  status: 'match' | 'different' | 'only_api' | 'only_backup';
  api?: {
    type: string;
    address: string;
    description: string | null;
  };
  backup?: {
    type: string;
    address: string;
    description: string | null;
  };
};

export function compareAliases(input: {
  apiAliases: Array<{
    name: string;
    type: string;
    address: string;
    description: string | null;
  }>;
  backupAliases: ConfigXmlAliasRecord[];
}): AliasComparisonEntry[] {
  const apiMap = new Map(input.apiAliases.map((entry) => [entry.name, entry]));
  const backupMap = new Map(input.backupAliases.map((entry) => [entry.name, entry]));
  const names = new Set([...apiMap.keys(), ...backupMap.keys()]);
  const results: AliasComparisonEntry[] = [];

  for (const name of [...names].sort()) {
    const api = apiMap.get(name);
    const backup = backupMap.get(name);

    if (api && !backup) {
      results.push({ name, status: 'only_api', api });
      continue;
    }

    if (!api && backup) {
      results.push({ name, status: 'only_backup', backup });
      continue;
    }

    if (!api || !backup) {
      continue;
    }

    const normalizedApi = normalizeAliasComparable(api);
    const normalizedBackup = normalizeAliasComparable(backup);

    results.push({
      name,
      status: normalizedApi === normalizedBackup ? 'match' : 'different',
      api,
      backup,
    });
  }

  return results;
}

function normalizeAliasComparable(entry: {
  type: string;
  address: string;
  description: string | null;
}): string {
  return [
    entry.type.trim().toLowerCase(),
    entry.address.replace(/\s+/g, ' ').trim().toLowerCase(),
    (entry.description ?? '').trim().toLowerCase(),
  ].join('|');
}

export function buildAliasPreview(input: {
  name: string;
  type: string;
  address: string;
  description?: string | null;
}): Record<string, unknown> {
  return {
    name: input.name.trim(),
    type: input.type.trim(),
    address: input.address.trim(),
    descr: input.description?.trim() || undefined,
  };
}
