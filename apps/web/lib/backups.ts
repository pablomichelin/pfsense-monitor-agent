'use server';

import { revalidatePath } from 'next/cache';
import {
  getNodeConfigBackupCommandStatus,
  requestNodeConfigBackup,
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
