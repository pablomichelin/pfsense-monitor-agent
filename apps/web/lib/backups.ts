'use server';

import { revalidatePath } from 'next/cache';
import {
  acknowledgeNodeBackupDrift,
  compareNodeConfigBackups,
  getNodeConfigBackupCommandStatus,
  requestNodeConfigBackup,
  updateNodeBackupRetentionPolicy,
} from './api';

export async function requestConfigBackupAction(nodeId: string) {
  const result = await requestNodeConfigBackup(nodeId);
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}

export async function pollConfigBackupCommandAction(
  nodeId: string,
  commandId: string,
) {
  return getNodeConfigBackupCommandStatus(nodeId, commandId);
}

export async function compareConfigBackupsAction(
  nodeId: string,
  fromBackupId: string,
  toBackupId: string,
) {
  return compareNodeConfigBackups(nodeId, fromBackupId, toBackupId);
}

export async function updateBackupRetentionPolicyAction(
  nodeId: string,
  body: {
    retention_count?: number | null;
    retention_max_bytes?: number | null;
  },
) {
  const result = await updateNodeBackupRetentionPolicy(nodeId, body);
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}

export async function acknowledgeBackupDriftAction(nodeId: string) {
  const result = await acknowledgeNodeBackupDrift(nodeId);
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}
