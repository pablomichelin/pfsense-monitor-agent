'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createAgentToken,
  createClient,
  createNode,
  createSite,
  createUser,
  revokeAgentToken,
  revokeAdminUserSession,
  rotateNodeSecret,
  setNodeMaintenance,
  updateClient,
  updateNode,
  updateSite,
  updateUser,
} from './api';

const adminRedirect = (section: string, status: 'ok' | 'error', message: string): never => {
  const params = new URLSearchParams({
    section,
    status,
    message,
  });

  redirect(`/admin?${params.toString()}`);
};

const normalizeOptional = (value: FormDataEntryValue | null): string | undefined => {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : undefined;
};

export async function createClientAction(formData: FormData): Promise<void> {
  try {
    const response = await createClient({
      name: String(formData.get('name') ?? '').trim(),
      code: String(formData.get('code') ?? '').trim(),
      status: (normalizeOptional(formData.get('status')) as 'active' | 'inactive' | undefined) ?? 'active',
    });

    revalidatePath('/admin');
    revalidatePath('/nodes');
    revalidatePath('/bootstrap');
    adminRedirect('client', 'ok', `Cliente ${response.client.code} criado.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar cliente';
    adminRedirect('client', 'error', message);
  }
}

export async function createSiteAction(formData: FormData): Promise<void> {
  try {
    const response = await createSite({
      client_id: String(formData.get('client_id') ?? '').trim(),
      name: String(formData.get('name') ?? '').trim(),
      code: String(formData.get('code') ?? '').trim(),
      city: normalizeOptional(formData.get('city')),
      state: normalizeOptional(formData.get('state')),
      timezone: normalizeOptional(formData.get('timezone')),
      status: (normalizeOptional(formData.get('status')) as 'active' | 'inactive' | undefined) ?? 'active',
    });

    revalidatePath('/admin');
    revalidatePath('/nodes');
    revalidatePath('/bootstrap');
    adminRedirect('site', 'ok', `Site ${response.site.code} criado.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar site';
    adminRedirect('site', 'error', message);
  }
}

export async function updateClientAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('client_id') ?? '').trim();

  if (!clientId) {
    redirect('/admin');
  }

  try {
    const response = await updateClient(clientId, {
      name: normalizeOptional(formData.get('name')),
      code: normalizeOptional(formData.get('code')),
      status:
        (normalizeOptional(formData.get('status')) as 'active' | 'inactive' | undefined) ??
        undefined,
    });

    revalidatePath('/admin');
    revalidatePath('/nodes');
    adminRedirect('client-edit', 'ok', `Cliente ${response.client.code} atualizado.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar cliente';
    adminRedirect('client-edit', 'error', message);
  }
}

export async function updateSiteAction(formData: FormData): Promise<void> {
  const siteId = String(formData.get('site_id') ?? '').trim();

  if (!siteId) {
    redirect('/admin');
  }

  try {
    const response = await updateSite(siteId, {
      name: normalizeOptional(formData.get('name')),
      code: normalizeOptional(formData.get('code')),
      city: normalizeOptional(formData.get('city')),
      state: normalizeOptional(formData.get('state')),
      timezone: normalizeOptional(formData.get('timezone')),
      status:
        (normalizeOptional(formData.get('status')) as 'active' | 'inactive' | undefined) ??
        undefined,
    });

    revalidatePath('/admin');
    revalidatePath('/nodes');
    adminRedirect('site-edit', 'ok', `Site ${response.site.code} atualizado.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar site';
    adminRedirect('site-edit', 'error', message);
  }
}

export async function createNodeAction(formData: FormData): Promise<void> {
  try {
    const response = await createNode({
      site_id: String(formData.get('site_id') ?? '').trim(),
      node_uid: String(formData.get('node_uid') ?? '').trim(),
      hostname: String(formData.get('hostname') ?? '').trim(),
      display_name: normalizeOptional(formData.get('display_name')),
      management_ip: normalizeOptional(formData.get('management_ip')),
      wan_ip: normalizeOptional(formData.get('wan_ip')),
      pfsense_version: normalizeOptional(formData.get('pfsense_version')),
      agent_version: normalizeOptional(formData.get('agent_version')),
      ha_role: normalizeOptional(formData.get('ha_role')),
      maintenance_mode: String(formData.get('maintenance_mode') ?? '') === 'on',
    });

    revalidatePath('/admin');
    revalidatePath('/nodes');
    revalidatePath('/bootstrap');
    redirect(`/nodes/${response.node.id}?created=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar node';
    adminRedirect('node', 'error', message);
  }
}

export async function createUserAction(formData: FormData): Promise<void> {
  try {
    const response = await createUser({
      email: String(formData.get('email') ?? '').trim(),
      display_name: normalizeOptional(formData.get('display_name')),
      password: String(formData.get('password') ?? ''),
      role:
        (normalizeOptional(formData.get('role')) as
          | 'superadmin'
          | 'admin'
          | 'operator'
          | 'readonly'
          | undefined) ?? 'readonly',
      status:
        (normalizeOptional(formData.get('status')) as 'active' | 'inactive' | undefined) ??
        'active',
    });

    revalidatePath('/admin');
    adminRedirect('user', 'ok', `Usuario ${response.user.email} criado.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar usuario';
    adminRedirect('user', 'error', message);
  }
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const userId = String(formData.get('user_id') ?? '').trim();

  if (!userId) {
    redirect('/admin');
  }

  try {
    const response = await updateUser(userId, {
      email: normalizeOptional(formData.get('email')),
      display_name: normalizeOptional(formData.get('display_name')),
      password: normalizeOptional(formData.get('password')),
      role: normalizeOptional(formData.get('role')) as
        | 'superadmin'
        | 'admin'
        | 'operator'
        | 'readonly'
        | undefined,
      status:
        (normalizeOptional(formData.get('status')) as 'active' | 'inactive' | undefined) ??
        undefined,
    });

    revalidatePath('/admin');
    adminRedirect('user-edit', 'ok', `Usuario ${response.user.email} atualizado.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar usuario';
    adminRedirect('user-edit', 'error', message);
  }
}

export async function revokeUserSessionAdminAction(formData: FormData): Promise<void> {
  const userId = String(formData.get('user_id') ?? '').trim();
  const sessionId = String(formData.get('session_id') ?? '').trim();

  if (!userId || !sessionId) {
    redirect('/admin?section=user-sessions&status=error&message=Sessao%20invalida');
  }

  try {
    await revokeAdminUserSession(userId, sessionId);
    revalidatePath('/admin');
    revalidatePath('/sessions');
    redirect('/admin?section=user-sessions&status=ok&message=Sessao%20revogada');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao revogar sessao';
    redirect(`/admin?section=user-sessions&status=error&message=${encodeURIComponent(message)}`);
  }
}

export async function rotateNodeSecretAction(formData: FormData): Promise<void> {
  const nodeId = String(formData.get('node_id') ?? '').trim();

  if (!nodeId) {
    redirect('/nodes');
  }

  try {
    await rotateNodeSecret(nodeId);
    revalidatePath(`/nodes/${nodeId}`);
    revalidatePath('/bootstrap');
    redirect(`/nodes/${nodeId}?rekey=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao rotacionar secret';
    redirect(`/nodes/${nodeId}?rekey_error=${encodeURIComponent(message)}`);
  }
}

export async function createAgentTokenAction(formData: FormData): Promise<void> {
  const nodeId = String(formData.get('node_id') ?? '').trim();

  if (!nodeId) {
    redirect('/admin?section=agent-token&status=error&message=Node%20invalido');
  }

  try {
    const response = await createAgentToken(nodeId, {
      expires_at: normalizeOptional(formData.get('expires_at')),
    });

    revalidatePath('/admin');
    revalidatePath(`/nodes/${nodeId}`);
    adminRedirect(
      'agent-token',
      'ok',
      `Token ${response.token.token_hint} emitido. Copie o valor agora: ${response.token.agent_token}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao emitir token';
    adminRedirect('agent-token', 'error', message);
  }
}

export async function revokeAgentTokenAction(formData: FormData): Promise<void> {
  const nodeId = String(formData.get('node_id') ?? '').trim();
  const tokenId = String(formData.get('token_id') ?? '').trim();

  if (!nodeId || !tokenId) {
    redirect('/admin?section=agent-token-list&status=error&message=Token%20invalido');
  }

  try {
    await revokeAgentToken(nodeId, tokenId);
    revalidatePath('/admin');
    revalidatePath(`/nodes/${nodeId}`);
    adminRedirect('agent-token-list', 'ok', 'Token revogado.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao revogar token';
    adminRedirect('agent-token-list', 'error', message);
  }
}

export async function setNodeMaintenanceAction(formData: FormData): Promise<void> {
  const nodeId = String(formData.get('node_id') ?? '').trim();

  if (!nodeId) {
    redirect('/nodes');
  }

  const maintenanceMode = String(formData.get('maintenance_mode') ?? '') === 'true';

  try {
    await setNodeMaintenance(nodeId, maintenanceMode);
    revalidatePath(`/nodes/${nodeId}`);
    revalidatePath('/nodes');
    revalidatePath('/dashboard');
    redirect(`/nodes/${nodeId}?maintenance=${maintenanceMode ? 'enabled' : 'disabled'}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao atualizar maintenance mode';
    redirect(`/nodes/${nodeId}?maintenance_error=${encodeURIComponent(message)}`);
  }
}

export async function updateNodeAction(formData: FormData): Promise<void> {
  const nodeId = String(formData.get('node_id') ?? '').trim();

  if (!nodeId) {
    redirect('/nodes');
  }

  const normalizeOptional = (key: string): string | undefined => {
    const value = String(formData.get(key) ?? '').trim();
    return value ? value : undefined;
  };

  try {
    await updateNode(nodeId, {
      hostname: normalizeOptional('hostname'),
      display_name: normalizeOptional('display_name'),
      management_ip: normalizeOptional('management_ip'),
      wan_ip: normalizeOptional('wan_ip'),
      pfsense_version: normalizeOptional('pfsense_version'),
      agent_version: normalizeOptional('agent_version'),
      ha_role: normalizeOptional('ha_role'),
    });
    revalidatePath(`/nodes/${nodeId}`);
    revalidatePath('/nodes');
    revalidatePath('/dashboard');
    redirect(`/nodes/${nodeId}?updated=1`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao atualizar node';
    redirect(`/nodes/${nodeId}?update_error=${encodeURIComponent(message)}`);
  }
}
