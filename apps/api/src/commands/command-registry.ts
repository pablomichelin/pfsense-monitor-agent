import { BadRequestException } from '@nestjs/common';
import { NodeCommandType } from '@prisma/client';
import type { PermissionKey } from '../auth/permission-keys';
import { appConfig } from '../config/app-config';
import {
  validateNodeRebootPayload,
  validateServiceRestartPayload,
} from '../operational-actions/operational-actions.util';
import {
  validateLocalUserCreatePayload,
  validateLocalUserDeletePayload,
  validateLocalUserDisablePayload,
  validateLocalUserSetPasswordPayload,
} from '../technicians/technician-accounts.util';
import { type CommandTypeDefinition } from './command-registry.util';

export {
  ACTIVE_COMMAND_STATUSES,
  TERMINAL_COMMAND_STATUSES,
  type CommandAuditPrefix,
  type CommandTypeDefinition,
} from './command-registry.util';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

function validatePfsenseUpgradePayload(
  payload: unknown,
): Record<string, unknown> | undefined {
  if (payload == null) {
    return undefined;
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException('invalid pfsense_upgrade payload');
  }

  const raw = payload as Record<string, unknown>;
  if (raw.target_version == null) {
    throw new BadRequestException('pfsense_upgrade requires target_version');
  }

  if (typeof raw.target_version !== 'string' || !raw.target_version.trim()) {
    throw new BadRequestException('target_version must be a non-empty string');
  }

  return {
    target_version: raw.target_version.trim(),
    ...(typeof raw.maintenance_mode_before === 'boolean'
      ? { maintenance_mode_before: raw.maintenance_mode_before }
      : {}),
    ...(typeof raw.backup_acknowledged_without_recent === 'boolean'
      ? {
          backup_acknowledged_without_recent:
            raw.backup_acknowledged_without_recent,
        }
      : {}),
  };
}

function validatePackageUpgradePayload(
  payload: unknown,
): Record<string, unknown> | undefined {
  if (payload == null) {
    throw new BadRequestException('package_upgrade requires payload');
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException('invalid package_upgrade payload');
  }

  const raw = payload as Record<string, unknown>;
  const targetVersion = raw.target_version;
  const artifactUrl = raw.artifact_url;
  const sha256 = raw.sha256;

  if (
    targetVersion == null ||
    typeof artifactUrl !== 'string' ||
    !artifactUrl.trim() ||
    typeof sha256 !== 'string' ||
    !SHA256_HEX.test(sha256)
  ) {
    throw new BadRequestException(
      'package_upgrade requires target_version, artifact_url and valid sha256',
    );
  }

  return {
    target_version: String(targetVersion).trim(),
    artifact_url: artifactUrl.trim(),
    sha256: sha256.toLowerCase(),
  };
}

export const COMMAND_REGISTRY: Record<NodeCommandType, CommandTypeDefinition> = {
  [NodeCommandType.config_backup_now]: {
    permission: 'backups.run',
    minAgentVersion: '0.1.0',
    expireMinutes: appConfig.configBackup.commandExpireMinutes,
    maxRetries: appConfig.commands.retryDefaults.configBackupMaxRetries,
    retryBackoffMs: appConfig.commands.retryDefaults.configBackupBackoffMs,
    maxConcurrentPerNode: 1,
    maxConcurrentGlobal: 0,
    auditPrefix: 'backup.config',
    validatePayload: (payload: unknown) => {
      if (payload == null) {
        return undefined;
      }
      if (typeof payload !== 'object' || Array.isArray(payload)) {
        return undefined;
      }
      const raw = payload as Record<string, unknown>;
      if (raw.follow_up_technician_provision != null) {
        return { follow_up_technician_provision: raw.follow_up_technician_provision };
      }
      return undefined;
    },
  },
  [NodeCommandType.pfsense_upgrade]: {
    permission: 'pfsense.upgrade.run',
    minAgentVersion: appConfig.pfsenseUpgrade.minAgentVersion,
    expireMinutes: appConfig.pfsenseUpgrade.commandExpireMinutes,
    maxRetries: appConfig.commands.retryDefaults.pfsenseUpgradeMaxRetries,
    retryBackoffMs: appConfig.commands.retryDefaults.pfsenseUpgradeBackoffMs,
    maxConcurrentPerNode: 1,
    maxConcurrentGlobal: appConfig.pfsenseUpgrade.maxConcurrentGlobal,
    auditPrefix: 'pfsense.upgrade',
    validatePayload: validatePfsenseUpgradePayload,
  },
  [NodeCommandType.package_upgrade]: {
    permission: 'package.upgrade.run',
    minAgentVersion: appConfig.packageUpgrade.minAgentVersion,
    expireMinutes: appConfig.packageUpgrade.commandExpireMinutes,
    maxRetries: appConfig.commands.retryDefaults.packageUpgradeMaxRetries,
    retryBackoffMs: appConfig.commands.retryDefaults.packageUpgradeBackoffMs,
    maxConcurrentPerNode: 1,
    maxConcurrentGlobal: appConfig.packageUpgrade.maxConcurrentGlobal,
    auditPrefix: 'package.upgrade',
    validatePayload: validatePackageUpgradePayload,
  },
  [NodeCommandType.service_restart]: {
    permission: 'service.restart.run',
    minAgentVersion: appConfig.operationalActions.minAgentVersion,
    expireMinutes: appConfig.operationalActions.commandExpireMinutes,
    maxRetries: appConfig.commands.retryDefaults.serviceRestartMaxRetries,
    retryBackoffMs: appConfig.commands.retryDefaults.serviceRestartBackoffMs,
    maxConcurrentPerNode: 1,
    maxConcurrentGlobal: 0,
    auditPrefix: 'service.restart',
    validatePayload: (payload: unknown) => {
      try {
        return validateServiceRestartPayload(payload);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'invalid service_restart payload',
        );
      }
    },
  },
  [NodeCommandType.node_reboot]: {
    permission: 'node.reboot.run',
    minAgentVersion: appConfig.operationalActions.minAgentVersion,
    expireMinutes: appConfig.operationalActions.commandExpireMinutes,
    maxRetries: appConfig.commands.retryDefaults.nodeRebootMaxRetries,
    retryBackoffMs: appConfig.commands.retryDefaults.nodeRebootBackoffMs,
    maxConcurrentPerNode: 1,
    maxConcurrentGlobal: 0,
    auditPrefix: 'node.reboot',
    validatePayload: (payload: unknown) => {
      try {
        return validateNodeRebootPayload(payload);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'invalid node_reboot payload',
        );
      }
    },
  },
  [NodeCommandType.local_user_create]: {
    permission: 'technicians.manage',
    minAgentVersion: appConfig.technicianAccounts.minAgentVersion,
    expireMinutes: appConfig.technicianAccounts.commandExpireMinutes,
    maxRetries: appConfig.commands.retryDefaults.localUserMaxRetries,
    retryBackoffMs: appConfig.commands.retryDefaults.localUserBackoffMs,
    maxConcurrentPerNode: 1,
    maxConcurrentGlobal: 0,
    auditPrefix: 'technician.create',
    validatePayload: (payload: unknown) => {
      try {
        return validateLocalUserCreatePayload(payload);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'invalid local_user_create payload',
        );
      }
    },
  },
  [NodeCommandType.local_user_set_password]: {
    permission: 'technicians.password_reset.run',
    minAgentVersion: appConfig.technicianAccounts.minAgentVersion,
    expireMinutes: appConfig.technicianAccounts.commandExpireMinutes,
    maxRetries: appConfig.commands.retryDefaults.localUserMaxRetries,
    retryBackoffMs: appConfig.commands.retryDefaults.localUserBackoffMs,
    maxConcurrentPerNode: 1,
    maxConcurrentGlobal: 0,
    auditPrefix: 'technician.password_reset',
    validatePayload: (payload: unknown) => {
      try {
        return validateLocalUserSetPasswordPayload(payload);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'invalid local_user_set_password payload',
        );
      }
    },
  },
  [NodeCommandType.local_user_disable]: {
    permission: 'technicians.manage',
    minAgentVersion: appConfig.technicianAccounts.minAgentVersion,
    expireMinutes: appConfig.technicianAccounts.commandExpireMinutes,
    maxRetries: appConfig.commands.retryDefaults.localUserMaxRetries,
    retryBackoffMs: appConfig.commands.retryDefaults.localUserBackoffMs,
    maxConcurrentPerNode: 1,
    maxConcurrentGlobal: 0,
    auditPrefix: 'technician.disable',
    validatePayload: (payload: unknown) => {
      try {
        return validateLocalUserDisablePayload(payload);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'invalid local_user_disable payload',
        );
      }
    },
  },
  [NodeCommandType.local_user_delete]: {
    permission: 'technicians.manage',
    minAgentVersion: appConfig.technicianAccounts.minAgentVersion,
    expireMinutes: appConfig.technicianAccounts.commandExpireMinutes,
    maxRetries: appConfig.commands.retryDefaults.localUserMaxRetries,
    retryBackoffMs: appConfig.commands.retryDefaults.localUserBackoffMs,
    maxConcurrentPerNode: 1,
    maxConcurrentGlobal: 0,
    auditPrefix: 'technician.delete',
    validatePayload: (payload: unknown) => {
      try {
        return validateLocalUserDeletePayload(payload);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'invalid local_user_delete payload',
        );
      }
    },
  },
};

export function getCommandDefinition(type: NodeCommandType): CommandTypeDefinition {
  return COMMAND_REGISTRY[type];
}

export function getCommandPermission(type: NodeCommandType): PermissionKey {
  return getCommandDefinition(type).permission;
}

export function isKnownCommandType(type: string): type is NodeCommandType {
  return Object.values(NodeCommandType).includes(type as NodeCommandType);
}
