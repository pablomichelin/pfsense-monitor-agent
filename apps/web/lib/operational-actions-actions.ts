'use server';

import { revalidatePath } from 'next/cache';
import {
  createBackupBatch,
  getOperationalActionsStatus,
  requestNodeReboot,
  requestServiceRestart,
  requestTableSearch,
  requestTableEntryRemove,
} from './api';

export async function fetchOperationalActionsStatus(nodeId: string) {
  return getOperationalActionsStatus(nodeId);
}

export async function requestServiceRestartAction(
  nodeId: string,
  service: string,
) {
  const result = await requestServiceRestart(nodeId, { service });
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}

export async function requestNodeRebootAction(
  nodeId: string,
  input: {
    confirm_hostname: string;
    delay_seconds?: number;
    enable_maintenance_mode?: boolean;
    acknowledge_ha_risk?: boolean;
  },
) {
  const result = await requestNodeReboot(nodeId, input);
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}

export async function requestTableSearchAction(nodeId: string, ip: string) {
  const result = await requestTableSearch(nodeId, { ip });
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}

export async function requestTableEntryRemoveAction(
  nodeId: string,
  table: string,
  ip: string,
) {
  const result = await requestTableEntryRemove(nodeId, { table, ip });
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}

export async function createBackupBatchAction(input: {
  node_ids: string[];
  label?: string;
  client_id?: string;
}) {
  const result = await createBackupBatch(input);
  revalidatePath('/nodes');
  return result;
}
