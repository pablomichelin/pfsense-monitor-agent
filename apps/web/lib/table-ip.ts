const INVALID_IP_MESSAGE =
  'Informe um IPv4 ou IPv6 válido. Ex.: 203.0.113.10';

export type TableTarget = {
  address: string;
  target: string;
  prefix: number;
};

function isIPv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

function isIPv6(value: string): boolean {
  if (!value.includes(':') || value.includes('%') || value.includes('/')) return false;
  try {
    return new URL(`http://[${value}]`).hostname.startsWith('[');
  } catch {
    return false;
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

function intToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

export function canonicalIpv4Network(ip: string, prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIpv4((ipv4ToInt(ip) & mask) >>> 0);
}

function cleanAddress(raw: string): string {
  let value = raw.trim();
  const bracketPort = value.match(/^\[([^\]]+)\]:(\d{1,5})$/);
  if (bracketPort && Number(bracketPort[2]) <= 65535) {
    value = bracketPort[1];
  } else if (value.startsWith('[') && value.endsWith(']')) {
    value = value.slice(1, -1).trim();
  }
  value = value.replace(/[.,;]+$/g, '');
  const withPort = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
  if (withPort && isIPv4(withPort[1]) && Number(withPort[2]) <= 65535) {
    value = withPort[1];
  }
  return value;
}

export function splitTypedMask(raw: string): { address: string; prefix?: number } {
  const match = raw.trim().match(/^(.*?)\/(\d+)$/);
  if (!match) return { address: raw };
  const prefix = Number(match[2]);
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 128) return { address: raw };
  return { address: match[1], prefix };
}

export function tableTargetInput(raw: string, currentPrefix: number): { address: string; prefix: number } {
  const typed = splitTypedMask(raw);
  return {
    address: typed.address,
    prefix: typed.prefix ?? (isIPv6(cleanAddress(typed.address)) ? 128 : currentPrefix === 128 ? 32 : currentPrefix),
  };
}

export function interpretTableTarget(
  raw: string,
  selectedPrefix: number,
): TableTarget | { error: string } {
  const typed = splitTypedMask(raw);
  const prefix = typed.prefix ?? selectedPrefix;
  const address = cleanAddress(typed.address);
  if (!address) return { error: 'Informe o IP a desbloquear.' };
  if (address.includes('%')) {
    return { error: 'Informe o IPv6 sem identificador de zona (o trecho depois de %).' };
  }

  if (isIPv6(address)) {
    if (prefix !== 128) return { error: 'Para IPv6, use a máscara /128 (endereço individual).' };
    // O contrato da API recebe o IPv6 individual sem sufixo CIDR.
    return { address, target: address, prefix: 128 };
  }
  if (!isIPv4(address)) return { error: INVALID_IP_MESSAGE };
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 32) {
    return { error: 'Para IPv4, escolha uma máscara entre /1 e /32.' };
  }
  if (prefix === 32) {
    return { address, target: address, prefix };
  }

  const network = canonicalIpv4Network(address, prefix);
  return { address, target: `${network}/${prefix}`, prefix };
}
