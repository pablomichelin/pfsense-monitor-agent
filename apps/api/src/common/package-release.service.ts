import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { appConfig } from '../config/app-config';

export type PackageReleaseMetadata = {
  version: string;
  sha256: string;
  repoRawBase: string;
};

@Injectable()
export class PackageReleaseService {
  private artifactChecksumCache: {
    path: string;
    mtimeMs: number;
    sha256: string;
  } | null = null;
  getPackageRelease(): {
    generated_at: string;
    version: string;
    sha256: string;
    repo_raw_base: string;
    artifact_url: string;
    installer_url: string;
  } {
    const release = this.readPackageReleaseMetadata();
    const urls = this.buildReleaseUrls(release);

    return {
      generated_at: new Date().toISOString(),
      version: release.version,
      sha256: release.sha256,
      repo_raw_base: release.repoRawBase,
      artifact_url: urls.artifactUrl,
      installer_url: urls.installerUrl,
    };
  }

  resolveLocalArtifactPath(version: string): string {
    const resolvedVersion = version.trim();
    if (!resolvedVersion) {
      throw new NotFoundException('package version not configured');
    }

    const candidates = [
      join(
        appConfig.packageRelease.artifactDir,
        `monitor-pfsense-package-v${resolvedVersion}.tar.gz`,
      ),
      join(
        process.cwd(),
        'dist',
        'pfsense-package',
        `monitor-pfsense-package-v${resolvedVersion}.tar.gz`,
      ),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new NotFoundException('package artifact not found on controller');
  }

  openArtifactStream(version?: string) {
    const resolvedVersion =
      version?.trim() || this.readPackageReleaseMetadata().version;
    const filePath = this.resolveLocalArtifactPath(resolvedVersion);
    const { size } = statSync(filePath);
    return {
      filePath,
      stream: createReadStream(filePath),
      filename: filePath.split('/').pop() ?? 'monitor-pfsense-package.tar.gz',
      size,
    };
  }

  /** SHA256 do artefato local; falha se divergir do config versionado. */
  assertArtifactMatchesConfig(version?: string): string {
    const release = this.readPackageReleaseMetadata();
    const resolvedVersion = version?.trim() || release.version;
    const filePath = this.resolveLocalArtifactPath(resolvedVersion);
    const actualSha256 = this.sha256HexOfFile(filePath);
    if (actualSha256 !== release.sha256.toLowerCase()) {
      throw new ServiceUnavailableException(
        'package artifact checksum mismatch on controller',
      );
    }
    return actualSha256;
  }

  private sha256HexOfFile(filePath: string): string {
    const { mtimeMs } = statSync(filePath);
    if (
      this.artifactChecksumCache?.path === filePath &&
      this.artifactChecksumCache.mtimeMs === mtimeMs
    ) {
      return this.artifactChecksumCache.sha256;
    }

    const sha256 = createHash('sha256')
      .update(readFileSync(filePath))
      .digest('hex');
    this.artifactChecksumCache = { path: filePath, mtimeMs, sha256 };
    return sha256;
  }

  buildReleaseUrls(release: PackageReleaseMetadata): {
    artifactUrl: string;
    installerUrl: string;
  } {
    const repoBase = release.repoRawBase.replace(/\/+$/, '');
    const installerUrl = `${repoBase}/packages/pfsense-package/bootstrap/install-from-release.sh`;

    try {
      this.resolveLocalArtifactPath(release.version);
      const publicBase = appConfig.packageRelease.publicBaseUrl.replace(
        /\/+$/,
        '',
      );
      return {
        artifactUrl: `${publicBase}/api/v1/agent/package-artifact`,
        installerUrl,
      };
    } catch {
      return {
        artifactUrl: `${repoBase}/dist/pfsense-package/monitor-pfsense-package-v${release.version}.tar.gz`,
        installerUrl,
      };
    }
  }

  private readPackageReleaseMetadata(): PackageReleaseMetadata {
    const fromFile = this.readPackageReleaseFromFile();
    if (fromFile) {
      return fromFile;
    }

    const version = appConfig.packageRelease.version;
    const sha256 = appConfig.packageRelease.sha256;
    const repoRawBase = appConfig.packageRelease.repoRawBase;

    if (!version || !sha256 || !repoRawBase) {
      throw new ServiceUnavailableException(
        'package release metadata is not configured',
      );
    }

    return { version, sha256, repoRawBase };
  }

  private readPackageReleaseFromFile(): PackageReleaseMetadata | null {
    const paths = [
      '/app/config/package-release.env',
      join(process.cwd(), 'config', 'package-release.env'),
      join(__dirname, '..', '..', '..', 'config', 'package-release.env'),
    ];

    for (const filePath of paths) {
      if (!existsSync(filePath)) {
        continue;
      }

      try {
        const raw = readFileSync(filePath, 'utf-8');
        const out: Record<string, string> = {};

        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            continue;
          }

          const eq = trimmed.indexOf('=');
          if (eq <= 0) {
            continue;
          }

          const key = trimmed.slice(0, eq).trim();
          const value = trimmed
            .slice(eq + 1)
            .trim()
            .replace(/^["']|["']$/g, '');
          out[key] = value;
        }

        const version = out.PACKAGE_RELEASE_VERSION?.trim();
        const sha256 = out.PACKAGE_RELEASE_SHA256?.trim();
        const repoRawBase = out.PACKAGE_RELEASE_REPO_RAW_BASE?.trim();

        if (version && sha256 && repoRawBase) {
          return { version, sha256, repoRawBase };
        }
      } catch {
        /* ignore */
      }
    }

    return null;
  }
}
