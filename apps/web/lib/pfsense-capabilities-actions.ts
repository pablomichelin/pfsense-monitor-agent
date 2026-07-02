'use server';

import { revalidatePath } from 'next/cache';
import {
  comparePfsenseAliases,
  getNodeCapabilities,
  revokePfrestCredential,
  testPfrestCredential,
  upsertPfrestCredential,
} from './api';

export async function fetchNodeCapabilities(nodeId: string) {
  return getNodeCapabilities(nodeId);
}

export async function savePfrestCredentialAction(
  nodeId: string,
  input: {
    auth_method: 'api_key' | 'bearer_token';
    secret: string;
    api_base_url?: string;
    scope_description?: string;
  },
) {
  const result = await upsertPfrestCredential(nodeId, input);
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}

export async function testPfrestCredentialAction(nodeId: string) {
  const result = await testPfrestCredential(nodeId);
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}

export async function revokePfrestCredentialAction(nodeId: string) {
  const result = await revokePfrestCredential(nodeId);
  revalidatePath(`/nodes/${nodeId}`);
  return result;
}

export async function comparePfsenseAliasesAction(nodeId: string) {
  return comparePfsenseAliases(nodeId);
}
