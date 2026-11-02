import { BadRequestException } from '@nestjs/common';

export const BOOTSTRAP_CONTROLLER_URL = 'https://pfs-monitor.systemup.inf.br';

function httpsUrl(value: string, label: string): URL {
  // Reject control characters and encoded path separators before URL normalization.
  if (/[\u0000-\u0020\u007f\\]/.test(value) || /%(?:2f|5c|2e)/i.test(value)) {
    throw new BadRequestException(`${label}: URL HTTPS inválida`);
  }
  let url: URL;
  try { url = new URL(value); } catch {
    throw new BadRequestException(`${label}: URL HTTPS inválida`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new BadRequestException(`${label}: use HTTPS sem credenciais, query ou fragmento`);
  }
  return url;
}

export function assertApprovedBootstrapUrl(value: string, approvedBases: string[], label: string): string {
  const url = httpsUrl(value, label);
  const approved = approvedBases.some((base) => {
    const allowed = httpsUrl(base, 'Origem configurada');
    const path = allowed.pathname.replace(/\/+$/, '');
    // A shared host such as raw.githubusercontent.com is not approval for every repository.
    return url.origin === allowed.origin &&
      (url.pathname === path || url.pathname.startsWith(`${path}/`));
  });
  if (!approved) throw new BadRequestException(`${label}: origem ou caminho não aprovado`);
  return url.href.replace(/\/+$/, '');
}

export function resolveBootstrapUrls(input: {
  releaseBaseUrlOverride?: string;
  controllerUrlOverride?: string;
  configuredReleaseBaseUrl?: string;
  packagePublicBaseUrl: string;
  packageRepoRawBase: string;
}) {
  // Only trusted server configuration can extend these roots; query parameters cannot.
  const releaseBases = [input.configuredReleaseBaseUrl, input.packagePublicBaseUrl,
    input.packageRepoRawBase].filter((value): value is string => Boolean(value));
  const releaseValue = input.releaseBaseUrlOverride?.trim() || input.configuredReleaseBaseUrl;
  const controllerValue = input.controllerUrlOverride?.trim() || BOOTSTRAP_CONTROLLER_URL;
  const controllerUrl = assertApprovedBootstrapUrl(controllerValue,
    [BOOTSTRAP_CONTROLLER_URL, input.packagePublicBaseUrl], 'Controlador');
  if (new URL(controllerUrl).pathname !== '/') {
    throw new BadRequestException('Controlador: informe somente a origem HTTPS aprovada');
  }
  return {
    releaseBaseUrl: releaseValue
      ? assertApprovedBootstrapUrl(releaseValue, releaseBases, 'Release') : null,
    controllerUrl,
    releaseBases,
    overrideApplied: Boolean(input.releaseBaseUrlOverride?.trim() || input.controllerUrlOverride?.trim()),
  };
}

export function validateBootstrapPackageRelease(release: {
  artifact_url: string; installer_url: string; sha256: string;
}, approvedBases: string[]): void {
  assertApprovedBootstrapUrl(release.artifact_url, approvedBases, 'Artefato');
  assertApprovedBootstrapUrl(release.installer_url, approvedBases, 'Instalador');
  if (!/^[a-f0-9]{64}$/i.test(release.sha256)) {
    throw new BadRequestException('Release: checksum SHA-256 inválido');
  }
}

// An allowlist, not a scrubber: command text and credentials can never enter audit metadata.
export function bootstrapRevealAuditMetadata(input: {
  releaseVersion: string; controllerUrl: string; overrideApplied: boolean;
}) {
  return {
    release_version: input.releaseVersion,
    controller_origin: new URL(input.controllerUrl).origin,
    override_applied: input.overrideApplied,
  };
}
