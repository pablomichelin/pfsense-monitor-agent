import { BadRequestException } from '@nestjs/common';

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export type PackageUpgradePayload = {
  target_version: string;
  artifact_url: string;
  sha256: string;
};

export function normalizePackageUpgradePayload(input: {
  target_version?: string;
  artifact_url?: string;
  sha256?: string;
}): PackageUpgradePayload {
  const targetVersion = input.target_version?.trim() ?? '';
  const artifactUrl = input.artifact_url?.trim() ?? '';
  const sha256 = input.sha256?.trim().toLowerCase() ?? '';

  if (!targetVersion) {
    throw new BadRequestException('target_version is required');
  }

  if (!artifactUrl) {
    throw new BadRequestException('artifact_url is required');
  }

  if (!SHA256_PATTERN.test(sha256)) {
    throw new BadRequestException('sha256 must be a 64-char hex string');
  }

  return {
    target_version: targetVersion,
    artifact_url: artifactUrl,
    sha256,
  };
}

export function isAgentAlreadyAtTargetVersion(
  agentVersion: string | null | undefined,
  targetVersion: string,
): boolean {
  const current = agentVersion?.trim();
  if (!current) {
    return false;
  }

  return current === targetVersion.trim();
}
