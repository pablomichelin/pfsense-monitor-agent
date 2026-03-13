import { appConfig } from '../config/app-config';

export const isPfSenseVersionHomologated = (
  version: string | null | undefined,
): boolean => {
  if (!version) {
    return false;
  }

  return appConfig.versionMatrix.homologatedPfSenseVersions.includes(version.trim());
};
