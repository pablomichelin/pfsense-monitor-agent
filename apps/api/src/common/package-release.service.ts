import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync, readFileSync, statSync } from 'fs';
import { Readable } from 'stream';
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
    if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(resolvedVersion)) {
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

  openArtifactStream(version?: string, expectedHash?: string) {
    // Snapshot metadata once and hash the very bytes returned (no check/open race).
    const release = this.readPackageReleaseMetadata();
    const resolvedVersion = version ?? release.version;
    const filePath = this.resolveLocalArtifactPath(resolvedVersion);
    if (statSync(filePath).size > 20 * 1024 * 1024) {
      throw new ServiceUnavailableException('package artifact exceeds size limit');
    }
    const sidecar = readFileSync(`${filePath}.sha256`, 'utf8').trim().split(/\s+/)[0];
    const expected = expectedHash ?? release.sha256;
    if (!/^[a-f0-9]{64}$/.test(expected) || sidecar !== expected ||
        (resolvedVersion === release.version && expected !== release.sha256.toLowerCase())) {
      throw new NotFoundException('package version/hash not published');
    }
    const bytes = readFileSync(filePath);
    if (createHash('sha256').update(bytes).digest('hex') !== expected) {
      throw new ServiceUnavailableException('package artifact checksum mismatch on controller');
    }
    return { filePath, size: bytes.length, stream: Readable.from(bytes),
      filename: `monitor-pfsense-package-v${resolvedVersion}.tar.gz`, sha256: expected };
  }

  assertArtifactMatchesConfig(): string {
    const artifact = this.openArtifactStream();
    artifact.stream.destroy();
    return artifact.sha256;
  }

  private verifiedPublication: { hash: string; until: number } | null = null;

  async verifyPublishedRelease(): Promise<void> {
    const release = this.getPackageRelease();
    this.assertArtifactMatchesConfig();
    if (this.verifiedPublication?.hash === release.sha256 && this.verifiedPublication.until > Date.now()) return;
    try {
      const base = appConfig.packageRelease.publicBaseUrl.replace(/\/+$/, '');
      const metadataResponse = await fetch(`${base}/api/v1/agent/package-release`, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!metadataResponse.ok) throw new Error('manifest HTTP failure');
      const published = await metadataResponse.json() as { version?: string; sha256?: string; artifact_url?: string };
      if (published.version !== release.version || published.sha256 !== release.sha256 || published.artifact_url !== release.artifact_url) throw new Error('manifest mismatch');
      const response = await fetch(release.artifact_url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok || !response.body) throw new Error('artifact HTTP failure');
      const hash = createHash('sha256');
      let size = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) throw new Error('artifact too large');
        hash.update(chunk);
      }
      if (hash.digest('hex') !== release.sha256) throw new Error('download checksum mismatch');
      this.verifiedPublication = { hash: release.sha256, until: Date.now() + 300000 };
    } catch {
      throw new ServiceUnavailableException('Published package verification failed; no upgrade was queued');
    }
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
        artifactUrl: `${publicBase}/api/v1/agent/package-artifacts/${release.version}/${release.sha256}`,
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
