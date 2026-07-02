import { createHash } from 'crypto';

export type ConfigDiffSectionStatus =
  | 'unchanged'
  | 'added'
  | 'removed'
  | 'modified';

export type ConfigDiffSection = {
  name: string;
  status: ConfigDiffSectionStatus;
  masked: boolean;
  summary?: string;
  changes?: string[];
};

export type ConfigDiffResult = {
  identical: boolean;
  from_sha256: string;
  to_sha256: string;
  sections: ConfigDiffSection[];
  secrets_masked: boolean;
  unknown_sections_masked: number;
};

const KNOWN_SECTIONS = new Set([
  'version',
  'theme',
  'system',
  'interfaces',
  'dhcpd',
  'dhcpdv6',
  'dyndnses',
  'unbound',
  'filter',
  'nat',
  'shaper',
  'ipsec',
  'openvpn',
  'vouchers',
  'virtualip',
  'pkg',
  'bridges',
  'gifs',
  'greifs',
  'ppps',
  'laggs',
  'vlans',
  'cron',
  'wol',
  'ntp',
  'aliases',
  'ca',
  'cert',
  'wireguard',
  'gateways',
  'staticroutes',
  'installedpackages',
]);

const SENSITIVE_DRIFT_SECTIONS = new Set([
  'filter',
  'system',
  'openvpn',
  'ipsec',
  'nat',
  'shaper',
  'wireguard',
  'ca',
  'cert',
]);

const SENSITIVE_FIELD_PATTERN =
  /(<[^>]*\b(?:password|passwd|secret|pre-shared-key|privkey|shared-key|apikey|api_key|encryption_password|passphrase|otp_seed)\b[^>]*>)[^<]*/gi;

export function extractTopLevelSections(xml: string): Map<string, string> {
  const sections = new Map<string, string>();
  const rootMatch = xml.match(/<pfsense\b[^>]*>([\s\S]*)<\/pfsense>/i);
  if (!rootMatch) {
    return sections;
  }

  const body = rootMatch[1] ?? '';
  const tagRegex = /<([a-zA-Z0-9_-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(body)) !== null) {
    const name = match[1]?.toLowerCase();
    const content = match[2] ?? '';
    if (!name) {
      continue;
    }
    if (!sections.has(name)) {
      sections.set(name, content.trim());
    }
  }

  return sections;
}

export function maskSensitiveXmlContent(content: string): string {
  return content.replace(SENSITIVE_FIELD_PATTERN, '$1[REDACTED]');
}

export function summarizeSection(name: string, content: string): string {
  const childTags = content.match(/<([a-zA-Z0-9_-]+)\b/g) ?? [];
  const uniqueTags = new Set(
    childTags.map((tag) => tag.replace(/^</, '').toLowerCase()),
  );

  if (name === 'filter') {
    const ruleCount = (content.match(/<rule\b/gi) ?? []).length;
    return `${ruleCount} regra(s)`;
  }

  if (name === 'openvpn' || name === 'ipsec') {
    return `${uniqueTags.size} elemento(s)`;
  }

  return `${uniqueTags.size} tag(s) filho(s)`;
}

function hashSectionContent(name: string, content: string, masked: boolean): string {
  const normalized = masked
    ? `[masked:${name}]`
    : maskSensitiveXmlContent(content);
  return createHash('sha256').update(normalized).digest('hex');
}

function diffSectionContent(
  name: string,
  fromContent: string,
  toContent: string,
): string[] {
  const fromLines = maskSensitiveXmlContent(fromContent)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const toLines = maskSensitiveXmlContent(toContent)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const fromSet = new Set(fromLines);
  const toSet = new Set(toLines);
  const changes: string[] = [];

  for (const line of toLines) {
    if (!fromSet.has(line)) {
      changes.push(`+ ${line.slice(0, 160)}`);
    }
  }

  for (const line of fromLines) {
    if (!toSet.has(line)) {
      changes.push(`- ${line.slice(0, 160)}`);
    }
  }

  return changes.slice(0, 20);
}

export function diffConfigXml(input: {
  fromXml: string;
  toXml: string;
  fromSha256: string;
  toSha256: string;
}): ConfigDiffResult {
  if (input.fromSha256 === input.toSha256) {
    return {
      identical: true,
      from_sha256: input.fromSha256,
      to_sha256: input.toSha256,
      sections: [],
      secrets_masked: true,
      unknown_sections_masked: 0,
    };
  }

  const fromSections = extractTopLevelSections(input.fromXml);
  const toSections = extractTopLevelSections(input.toXml);
  const sectionNames = new Set([...fromSections.keys(), ...toSections.keys()]);
  const sections: ConfigDiffSection[] = [];
  let unknownSectionsMasked = 0;

  for (const name of [...sectionNames].sort()) {
    const fromContent = fromSections.get(name);
    const toContent = toSections.get(name);
    const isKnown = KNOWN_SECTIONS.has(name);

    if (!fromContent && toContent) {
      sections.push({
        name,
        status: 'added',
        masked: !isKnown,
        summary: isKnown ? summarizeSection(name, toContent) : '[conteudo mascarado]',
      });
      if (!isKnown) {
        unknownSectionsMasked += 1;
      }
      continue;
    }

    if (fromContent && !toContent) {
      sections.push({
        name,
        status: 'removed',
        masked: !isKnown,
        summary: isKnown ? summarizeSection(name, fromContent) : '[conteudo mascarado]',
      });
      if (!isKnown) {
        unknownSectionsMasked += 1;
      }
      continue;
    }

    if (!fromContent || !toContent) {
      continue;
    }

    const fromHash = hashSectionContent(name, fromContent, !isKnown);
    const toHash = hashSectionContent(name, toContent, !isKnown);

    if (fromHash === toHash) {
      sections.push({
        name,
        status: 'unchanged',
        masked: !isKnown,
        summary: isKnown ? summarizeSection(name, toContent) : '[conteudo mascarado]',
      });
      if (!isKnown) {
        unknownSectionsMasked += 1;
      }
      continue;
    }

    sections.push({
      name,
      status: 'modified',
      masked: !isKnown,
      summary: isKnown ? summarizeSection(name, toContent) : '[conteudo mascarado]',
      changes: isKnown ? diffSectionContent(name, fromContent, toContent) : undefined,
    });

    if (!isKnown) {
      unknownSectionsMasked += 1;
    }
  }

  return {
    identical: false,
    from_sha256: input.fromSha256,
    to_sha256: input.toSha256,
    sections,
    secrets_masked: true,
    unknown_sections_masked: unknownSectionsMasked,
  };
}

export function detectConfigDrift(input: {
  previousSections: Map<string, string>;
  currentSections: Map<string, string>;
  previousSha256: string;
  currentSha256: string;
}): {
  drift: boolean;
  changed_sections: string[];
  sensitive_changed_sections: string[];
} {
  if (input.previousSha256 === input.currentSha256) {
    return {
      drift: false,
      changed_sections: [],
      sensitive_changed_sections: [],
    };
  }

  const sectionNames = new Set([
    ...input.previousSections.keys(),
    ...input.currentSections.keys(),
  ]);
  const changedSections: string[] = [];
  const sensitiveChangedSections: string[] = [];

  for (const name of sectionNames) {
    const previous = input.previousSections.get(name) ?? '';
    const current = input.currentSections.get(name) ?? '';
    const previousHash = hashSectionContent(
      name,
      previous,
      !KNOWN_SECTIONS.has(name),
    );
    const currentHash = hashSectionContent(
      name,
      current,
      !KNOWN_SECTIONS.has(name),
    );

    if (previousHash !== currentHash) {
      changedSections.push(name);
      if (SENSITIVE_DRIFT_SECTIONS.has(name)) {
        sensitiveChangedSections.push(name);
      }
    }
  }

  return {
    drift: sensitiveChangedSections.length > 0,
    changed_sections: changedSections.sort(),
    sensitive_changed_sections: sensitiveChangedSections.sort(),
  };
}

export function sectionHashesFromXml(xml: string): Map<string, string> {
  const sections = extractTopLevelSections(xml);
  const hashes = new Map<string, string>();

  for (const [name, content] of sections.entries()) {
    hashes.set(
      name,
      hashSectionContent(name, content, !KNOWN_SECTIONS.has(name)),
    );
  }

  return hashes;
}
