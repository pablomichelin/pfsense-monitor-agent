'use server';

import { revalidatePath } from 'next/cache';
import { cancelNodeCommand, getNodeCommandHistory } from './api';

export async function fetchNodeCommandHistory(nodeId: string) {
  return getNodeCommandHistory(nodeId);
}

export async function cancelNodeCommandAction(nodeId: string, commandId: string) {
  const result = await cancelNodeCommand(nodeId, commandId);
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}
