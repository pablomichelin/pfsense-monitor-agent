// Os blocos de diagnóstico são copiados para um shell no pfSense.
// URLs dos overrides devem ser tratadas exclusivamente como argumentos.
export function buildBootstrapHref(filters: {
  cursor?: string;
  clientId?: string;
  siteId?: string;
  search?: string;
  bucket?: string;
  nodeId?: string;
  releaseBaseUrl?: string;
  controllerUrl?: string;
  heartbeatMode?: 'normal' | 'light';
}): string {
  const params = new URLSearchParams();
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.clientId) params.set('client_id', filters.clientId);
  if (filters.siteId) params.set('site_id', filters.siteId);
  if (filters.search) params.set('search', filters.search);
  if (filters.bucket) params.set('bucket', filters.bucket);
  if (filters.nodeId) params.set('node_id', filters.nodeId);
  if (filters.releaseBaseUrl) params.set('release_base_url', filters.releaseBaseUrl);
  if (filters.controllerUrl) params.set('controller_url', filters.controllerUrl);
  if (filters.heartbeatMode) params.set('heartbeat_mode', filters.heartbeatMode);
  const query = params.toString();
  return query ? `/bootstrap?${query}` : '/bootstrap';
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function evidenceUrl(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '[URL omitida]';
    // Queries, fragments and userinfo can contain credentials even in diagnostics.
    return `${url.origin}${url.pathname}`;
  } catch { return '[URL omitida]'; }
}

export function buildBootstrapEvidenceBlock(input: {
  nodeId: string; nodeUid: string; hostname: string; pfsenseVersion: string | null;
  releaseVersion: string; artifactUrl: string | null; checksumUrl: string | null;
  installerUrl: string | null; releaseBaseUrl?: string; controllerUrl?: string;
}): string {
  const line = (value: string | null) => (value ?? '-').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ');
  return [
    `data_registro: ${new Date().toISOString()}`,
    `node_id: ${line(input.nodeId)}`,
    `node_uid: ${line(input.nodeUid)}`,
    `hostname: ${line(input.hostname)}`,
    `pfsense_version: ${line(input.pfsenseVersion)}`,
    `agent_release_version: ${line(input.releaseVersion)}`,
    `artifact_url: ${evidenceUrl(input.artifactUrl)}`,
    `checksum_url: ${evidenceUrl(input.checksumUrl)}`,
    `installer_url: ${evidenceUrl(input.installerUrl)}`,
    `release_base_url_override: ${evidenceUrl(input.releaseBaseUrl)}`,
    `controller_url_override: ${evidenceUrl(input.controllerUrl)}`,
    'test_connection_resultado: [preencher apos a rodada]',
    'heartbeat_manual_resultado: [preencher apos a rodada]',
    'painel_online_evidencia: [preencher com print ou anotacao]',
    'comando_bootstrap_usado: [OMITIDO: contém credencial; não compartilhar]',
  ].join('\n');
}

export function extractHostname(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function buildPfSensePrecheckBlock(input: {
  controllerUrl: string;
  installerUrl: string | null;
  artifactUrl: string | null;
  checksumUrl: string | null;
}): string {
  const lines = [
    'cat /etc/version',
    '',
    '# teste de DNS para os destinos da rodada',
  ];
  const hostnames = [
    extractHostname(input.controllerUrl),
    extractHostname(input.installerUrl),
    extractHostname(input.artifactUrl),
    extractHostname(input.checksumUrl),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  if (hostnames.length > 0) {
    for (const hostname of hostnames) lines.push(`drill ${shellQuote(hostname)}`);
  } else {
    lines.push('# hostnames indisponiveis nesta visualizacao');
  }

  lines.push('');
  lines.push('# teste de saida HTTP/HTTPS para os URLs efetivos da rodada');
  lines.push(`fetch -qo /tmp/monitor-controller-check.out ${shellQuote(`${input.controllerUrl}/healthz`)} || true`);

  if (input.installerUrl) {
    lines.push(`fetch -qo /tmp/monitor-installer-check.out ${shellQuote(input.installerUrl)} || true`);
  }
  if (input.artifactUrl) {
    lines.push(`fetch -qo /tmp/monitor-artifact-check.out ${shellQuote(input.artifactUrl)} || true`);
  }
  if (input.checksumUrl) {
    lines.push(`fetch -qo /tmp/monitor-checksum-check.out ${shellQuote(input.checksumUrl)} || true`);
  }

  return lines.join('\n');
}
