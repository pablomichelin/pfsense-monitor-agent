'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  createFleetGroup,
  createFleetTag,
  deleteFleetGroup,
  deleteFleetTag,
  setFleetGroupMembers,
  updateFleetGroup,
  updateFleetTag,
  updateNodeFleetMetadata,
  type NodeCriticality,
} from '@/lib/api';

export type FleetOrgActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; status?: number };

function mapError<T = void>(error: unknown, fallback: string): FleetOrgActionResult<T> {
  if (error instanceof ApiError) {
    return { ok: false, error: error.message, status: error.status };
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

export async function createTagAction(formData: FormData): Promise<FleetOrgActionResult> {
  try {
    await createFleetTag({
      client_id: String(formData.get('client_id') ?? '').trim(),
      name: String(formData.get('name') ?? '').trim(),
    });
    revalidatePath('/nodes');
    revalidatePath('/admin/grupos');
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao criar tag');
  }
}

export async function deleteTagAction(tagId: string): Promise<FleetOrgActionResult> {
  try {
    await deleteFleetTag(tagId);
    revalidatePath('/nodes');
    revalidatePath('/admin/grupos');
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao excluir tag');
  }
}

export async function createGroupAction(formData: FormData): Promise<FleetOrgActionResult> {
  try {
    await createFleetGroup({
      client_id: String(formData.get('client_id') ?? '').trim(),
      name: String(formData.get('name') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim() || undefined,
    });
    revalidatePath('/nodes');
    revalidatePath('/admin/grupos');
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao criar grupo');
  }
}

export async function deleteGroupAction(groupId: string): Promise<FleetOrgActionResult> {
  try {
    await deleteFleetGroup(groupId);
    revalidatePath('/nodes');
    revalidatePath('/admin/grupos');
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao excluir grupo');
  }
}

export async function updateGroupMembersAction(
  groupId: string,
  nodeIds: string[],
): Promise<FleetOrgActionResult> {
  try {
    await setFleetGroupMembers(groupId, nodeIds);
    revalidatePath('/nodes');
    revalidatePath('/admin/grupos');
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao atualizar membros do grupo');
  }
}

export async function updateNodeFleetMetadataAction(
  formData: FormData,
): Promise<FleetOrgActionResult> {
  const nodeId = String(formData.get('node_id') ?? '').trim();
  const criticality = String(formData.get('criticality') ?? '').trim() as NodeCriticality;
  const tagIds = formData
    .getAll('tag_ids')
    .map((value) => String(value).trim())
    .filter(Boolean);

  try {
    await updateNodeFleetMetadata(nodeId, {
      criticality: criticality || undefined,
      tag_ids: tagIds,
    });
    revalidatePath(`/nodes/${nodeId}`);
    revalidatePath('/nodes');
    return { ok: true };
  } catch (error) {
    return mapError(error, 'Falha ao atualizar organização do firewall');
  }
}
