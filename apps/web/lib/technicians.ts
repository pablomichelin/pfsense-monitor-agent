'use server';

import { revalidatePath } from 'next/cache';
import {
  createTechnician,
  createTechnicianBatchPasswordReset,
  createTechnicianBatchProvision,
  createTechnicianBatchRevoke,
  createTechnicianFleetRevoke,
  deleteTechnicianFromRegistry,
  getCommandBatchStatus,
  getTechnicians,
  type TechnicianBatchActionResponse,
  type TechnicianBatchRevokeResponse,
  type TechnicianFleetRevokeResponse,
  type TechniciansListResponse,
} from './api';

export async function listTechniciansAction(
  status?: 'active' | 'revoked',
): Promise<TechniciansListResponse> {
  return getTechnicians(status);
}

function revalidateTechnicianSurfaces() {
  revalidatePath('/nodes');
  revalidatePath('/admin/tecnicos');
}

export async function createTechnicianAction(input: {
  full_name: string;
  login_username: string;
  notes?: string;
}) {
  const result = await createTechnician(input);
  revalidateTechnicianSurfaces();
  return result;
}

export async function deleteTechnicianFromRegistryAction(input: {
  technician_id: string;
  confirm_login_username: string;
}) {
  const result = await deleteTechnicianFromRegistry(
    input.technician_id,
    input.confirm_login_username,
  );
  revalidateTechnicianSurfaces();
  return result;
}

export async function createTechnicianBatchProvisionAction(input: {
  technician_id: string;
  node_ids: string[];
  password?: string;
  privilege_profile?: 'admin_full';
  label?: string;
  client_id?: string;
  confirm: 'CONFIRMAR';
}): Promise<TechnicianBatchActionResponse> {
  const result = await createTechnicianBatchProvision(input);
  revalidateTechnicianSurfaces();
  return result;
}

export async function createTechnicianBatchPasswordResetAction(input: {
  technician_id: string;
  node_ids: string[];
  password?: string;
  label?: string;
  client_id?: string;
  confirm: 'CONFIRMAR';
}): Promise<TechnicianBatchActionResponse> {
  const result = await createTechnicianBatchPasswordReset(input);
  revalidateTechnicianSurfaces();
  return result;
}

export async function createTechnicianBatchRevokeAction(input: {
  technician_id: string;
  node_ids: string[];
  action: 'disable' | 'delete';
  confirm: 'CONFIRMAR';
  label?: string;
  client_id?: string;
}): Promise<TechnicianBatchRevokeResponse> {
  const result = await createTechnicianBatchRevoke(input);
  revalidateTechnicianSurfaces();
  return result;
}

export async function createTechnicianFleetRevokeAction(input: {
  technician_id: string;
  action: 'disable' | 'delete';
  confirm: 'CONFIRMAR';
  label?: string;
  client_id?: string;
}): Promise<TechnicianFleetRevokeResponse> {
  const result = await createTechnicianFleetRevoke(input.technician_id, {
    action: input.action,
    confirm: input.confirm,
    label: input.label,
    client_id: input.client_id,
  });
  revalidateTechnicianSurfaces();
  return result;
}

export async function pollCommandBatchStatusAction(batchId: string) {
  return getCommandBatchStatus(batchId);
}
