import { NodeExternalCredentialAuthMethod } from '@prisma/client';

export type PfrestProbeResult = {
  ok: boolean;
  status: number;
  latencyMs: number;
  message: string;
  version?: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function buildAuthHeaders(input: {
  authMethod: NodeExternalCredentialAuthMethod;
  secret: string;
}): Record<string, string> {
  if (input.authMethod === NodeExternalCredentialAuthMethod.bearer_token) {
    return {
      Authorization: `Bearer ${input.secret.trim()}`,
    };
  }

  return {
    'X-API-Key': input.secret.trim(),
  };
}

export async function probePfrestConnection(input: {
  baseUrl: string;
  authMethod: NodeExternalCredentialAuthMethod;
  secret: string;
  timeoutMs: number;
}): Promise<PfrestProbeResult> {
  const started = Date.now();
  const base = normalizeBaseUrl(input.baseUrl);
  const url = `${base}/api/v2/status`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...buildAuthHeaders(input),
      },
      signal: controller.signal,
    });

    const latencyMs = Date.now() - started;
    const bodyText = await response.text();
    let version: string | undefined;

    if (response.ok) {
      try {
        const parsed = JSON.parse(bodyText) as {
          data?: { version?: string };
          version?: string;
        };
        version =
          parsed.data?.version?.trim() ||
          parsed.version?.trim() ||
          undefined;
      } catch {
        // ignore parse errors on success body
      }

      return {
        ok: true,
        status: response.status,
        latencyMs,
        message: 'Conexão pfREST read-only OK',
        version,
      };
    }

    return {
      ok: false,
      status: response.status,
      latencyMs,
      message: `pfREST respondeu HTTP ${response.status}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Timeout após ${input.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'Falha de conexão pfREST';

    return {
      ok: false,
      status: 0,
      latencyMs,
      message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export { buildAuthHeaders, normalizeBaseUrl };
