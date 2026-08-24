'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  createTechnician,
  createTechnicianBatchPasswordReset,
  createTechnicianBatchProvision,
  createTechnicianBatchRevoke,
  createTechnicianFleetRevoke,
  deleteTechnicianFromRegistry,
  getCommandBatchStatus,
  getNodeConfigBackupCommandStatus,
  getNodeTechnicianAccounts,
  getTechnicians,
  type TechnicianBatchActionResponse,
  type TechnicianBatchRevokeResponse,
  type TechnicianFleetRevokeResponse,
  type TechniciansListResponse,
} from './api';

export type TechnicianActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function revalidateTechnicianSurfaces() {
  revalidatePath('/nodes');
  revalidatePath('/admin/tecnicos');
}

function mapTechnicianError(message: string, fallback: string): string {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes('password must be')) {
    return 'A senha deve ter entre 10 e 64 caracteres, ou deixe o campo vazio para gerar automaticamente.';
  }
  if (normalized === 'password is required') {
    return 'Informe uma senha ou deixe o campo vazio para gerar automaticamente.';
  }
  if (normalized.includes('login_username already registered')) {
    return 'Este login pfSense já está cadastrado para outro técnico ativo.';
  }
  if (
    normalized.includes('is reserved') ||
    normalized.includes('login_username is reserved') ||
    normalized.includes('cannot be managed')
  ) {
    return 'O usuário admin (e root) é exclusivo do pfSense e não pode ser cadastrado ou gerenciado pelo sistema.';
  }
  if (normalized.includes('confirm must be')) {
    return 'Digite CONFIRMAR para confirmar a ação.';
  }
  if (normalized.includes('batch exceeds maximum size')) {
    return 'O lote excede o tamanho máximo permitido. Reduza o filtro ou selecione menos firewalls.';
  }
  if (normalized.includes('node_ids must not be empty')) {
    return 'Nenhum firewall no alvo da ação.';
  }
  if (normalized.includes('technician not found')) {
    return 'Técnico não encontrado.';
  }
  if (normalized.includes('confirm_login_username does not match')) {
    return 'Digite o login pfSense exato do técnico para confirmar a exclusão.';
  }
  if (normalized.includes('technician account') && normalized.includes('disabled')) {
    return 'Gestão de contas de técnicos está desabilitada no controlador.';
  }
  if (normalized.includes('no recent config backup')) {
    return 'Bloqueado: é necessário um backup recente do config.xml antes de alterar usuários locais.';
  }
  if (normalized.includes('command expired before backup follow-up')) {
    return 'O backup expirou antes do provisionamento automático. Tente novamente.';
  }
  if (normalized.includes('command expired')) {
    return 'O comando expirou sem resposta do agente. Verifique o heartbeat do firewall e tente novamente.';
  }

  return message.trim() || fallback;
}

function mapError<T>(error: unknown, fallback: string): TechnicianActionResult<T> {
  if (error instanceof ApiError) {
    return {
      ok: false,
      error: mapTechnicianError(error.message, fallback),
      status: error.status,
    };
  }

  if (error instanceof Error && error.message) {
    return { ok: false, error: mapTechnicianError(error.message, fallback) };
  }

  return { ok: false, error: fallback };
}

export async function listTechniciansAction(
  status?: 'active' | 'revoked',
): Promise<TechniciansListResponse> {
  return getTechnicians(status);
}

export async function createTechnicianAction(input: {
  full_name: string;
  login_username: string;
  notes?: string;
}): Promise<
  TechnicianActionResult<{
    id: string;
    full_name: string;
    login_username: string;
    status: string;
  }>
> {
  try {
    const result = await createTechnician(input);
    revalidateTechnicianSurfaces();
    return { ok: true, data: result };
  } catch (error) {
    return mapError(error, 'Falha ao cadastrar técnico');
  }
}

export async function deleteTechnicianFromRegistryAction(input: {
  technician_id: string;
  confirm_login_username: string;
}): Promise<
  TechnicianActionResult<{
    id: string;
    full_name: string;
    login_username: string;
    status: string;
    revoked_at: string | null;
  }>
> {
  try {
    const result = await deleteTechnicianFromRegistry(
      input.technician_id,
      input.confirm_login_username,
    );
    revalidateTechnicianSurfaces();
    return { ok: true, data: result };
  } catch (error) {
    return mapError(error, 'Falha ao remover técnico do cadastro');
  }
}

export async function createTechnicianBatchProvisionAction(input: {
  technician_id: string;
  node_ids: string[];
  password?: string;
  privilege_profile?: 'admin_full';
  backup_before_provision?: boolean;
  label?: string;
  client_id?: string;
  confirm: 'CONFIRMAR';
}): Promise<TechnicianActionResult<TechnicianBatchActionResponse>> {
  try {
    const trimmedPassword = input.password?.trim();
    const result = await createTechnicianBatchProvision({
      technician_id: input.technician_id,
      node_ids: input.node_ids,
      privilege_profile: input.privilege_profile,
      backup_before_provision: input.backup_before_provision,
      label: input.label,
      client_id: input.client_id,
      confirm: input.confirm,
      ...(trimmedPassword ? { password: trimmedPassword } : {}),
    });
    revalidateTechnicianSurfaces();
    return { ok: true, data: result };
  } catch (error) {
    return mapError(error, 'Falha ao provisionar técnico em lote');
  }
}

export async function createTechnicianBatchPasswordResetAction(input: {
  technician_id: string;
  node_ids: string[];
  password?: string;
  label?: string;
  client_id?: string;
  confirm: 'CONFIRMAR';
}): Promise<TechnicianActionResult<TechnicianBatchActionResponse>> {
  try {
    const trimmedPassword = input.password?.trim();
    const result = await createTechnicianBatchPasswordReset({
      technician_id: input.technician_id,
      node_ids: input.node_ids,
      label: input.label,
      client_id: input.client_id,
      confirm: input.confirm,
      ...(trimmedPassword ? { password: trimmedPassword } : {}),
    });
    revalidateTechnicianSurfaces();
    return { ok: true, data: result };
  } catch (error) {
    return mapError(error, 'Falha ao resetar senha em lote');
  }
}

export async function createTechnicianBatchRevokeAction(input: {
  technician_id: string;
  node_ids: string[];
  action: 'disable' | 'delete';
  confirm: 'CONFIRMAR';
  label?: string;
  client_id?: string;
}): Promise<TechnicianActionResult<TechnicianBatchRevokeResponse>> {
  try {
    const result = await createTechnicianBatchRevoke(input);
    revalidateTechnicianSurfaces();
    return { ok: true, data: result };
  } catch (error) {
    return mapError(error, 'Falha ao criar lote de revogação');
  }
}

export async function createTechnicianFleetRevokeAction(input: {
  technician_id: string;
  action: 'disable' | 'delete';
  confirm: 'CONFIRMAR';
  label?: string;
  client_id?: string;
}): Promise<TechnicianActionResult<TechnicianFleetRevokeResponse>> {
  try {
    const result = await createTechnicianFleetRevoke(input.technician_id, {
      action: input.action,
      confirm: input.confirm,
      label: input.label,
      client_id: input.client_id,
    });
    revalidateTechnicianSurfaces();
    return { ok: true, data: result };
  } catch (error) {
    return mapError(error, 'Falha ao revogar técnico na frota');
  }
}

export async function pollCommandBatchStatusAction(batchId: string) {
  return getCommandBatchStatus(batchId);
}

export async function pollBackupCommandStatusAction(nodeId: string, commandId: string) {
  return getNodeConfigBackupCommandStatus(nodeId, commandId);
}

export async function pollNodeTechnicianAccountsAction(nodeId: string) {
  return getNodeTechnicianAccounts(nodeId);
}
