import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { appConfig } from '../config/app-config';

export type PackageReleaseInfo = {
  version: string;
  sha256: string;
  repoRawBase: string;
  artifactUrl: string;
  installerUrl: string;
};

@Injectable()
export class PackageReleaseService {
  getPackageRelease(): {
    generated_at: string;
    version: string;
    sha256: string;
    repo_raw_base: string;
    artifact_url: string;
    installer_url: string;
  } {
    const release = this.readPackageReleaseFromFile() ?? {
      version: appConfig.packageRelease.version,
      sha256: appConfig.packageRelease.sha256,
      repoRawBase: appConfig.packageRelease.repoRawBase,
    };

    if (!release.version || !release.sha256 || !release.repoRawBase) {
      throw new ServiceUnavailableException('package release metadata is not configured');
    }

    const base = release.repoRawBase.replace(/\/+$/, '');
    const artifactUrl = `${base}/dist/pfsense-package/monitor-pfsense-package-v${release.version}.tar.gz`;
    const installerUrl = `${base}/packages/pfsense-package/bootstrap/install-from-release.sh`;

    return {
      generated_at: new Date().toISOString(),
      version: release.version,
      sha256: release.sha256,
      repo_raw_base: release.repoRawBase,
      artifact_url: artifactUrl,
      installer_url: installerUrl,
    };
  }

  private readPackageReleaseFromFile(): PackageReleaseInfo | null {
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
          const base = repoRawBase.replace(/\/+$/, '');
          return {
            version,
            sha256,
            repoRawBase,
            artifactUrl: `${base}/dist/pfsense-package/monitor-pfsense-package-v${version}.tar.gz`,
            installerUrl: `${base}/packages/pfsense-package/bootstrap/install-from-release.sh`,
          };
        }
      } catch {
        /* ignore */
      }
    }

    return null;
  }
}
