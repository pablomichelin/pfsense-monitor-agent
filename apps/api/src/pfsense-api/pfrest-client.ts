import { NodeExternalCredentialAuthMethod } from '@prisma/client';
import { buildAuthHeaders, normalizeBaseUrl } from '../node-capabilities/pfrest-probe.util';

export type PfrestFetchResult = {
  ok: boolean;
  status: number;
  json?: unknown;
  error?: string;
};

export async function pfrestFetch(input: {
  baseUrl: string;
  path: string;
  authMethod: NodeExternalCredentialAuthMethod;
  secret: string;
  timeoutMs: number;
  method?: string;
  body?: unknown;
}): Promise<PfrestFetchResult> {
  const base = normalizeBaseUrl(input.baseUrl);
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
  const url = `${base}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...buildAuthHeaders({
        authMethod: input.authMethod,
        secret: input.secret,
      }),
    };

    let body: string | undefined;
    if (input.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(input.body);
    }

    const response = await fetch(url, {
      method: input.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: text.slice(0, 500) || `HTTP ${response.status}`,
      };
    }

    if (!text.trim()) {
      return { ok: true, status: response.status, json: null };
    }

    try {
      return {
        ok: true,
        status: response.status,
        json: JSON.parse(text) as unknown,
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        error: 'Resposta pfREST não é JSON válido',
      };
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Timeout após ${input.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'Falha de conexão pfREST';

    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export function extractPfrestAliases(payload: unknown): PfrestAliasRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const data = root.data;

  const list = Array.isArray(data)
    ? data
    : Array.isArray(root)
      ? root
      : Array.isArray(root.aliases)
        ? root.aliases
        : [];

  const aliases: PfrestAliasRecord[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? record.id ?? '').trim();
    if (!name) {
      continue;
    }

    aliases.push({
      name,
      type: String(record.type ?? record.alias_type ?? 'unknown').trim(),
      address: normalizeAliasAddress(record),
      description: String(record.descr ?? record.description ?? '').trim() || null,
    });
  }

  return aliases.sort((a, b) => a.name.localeCompare(b.name));
}

export type PfrestAliasRecord = {
  name: string;
  type: string;
  address: string;
  description: string | null;
};

function normalizeAliasAddress(record: Record<string, unknown>): string {
  const direct = record.address ?? record.content ?? record.detail;
  if (typeof direct === 'string') {
    return direct.trim();
  }
  if (Array.isArray(direct)) {
    return direct.map(String).join('\n').trim();
  }
  return '';
}
