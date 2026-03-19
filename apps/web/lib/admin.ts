'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import {
  createAgentToken,
  createClient,
  createNode,
  createSite,
  createUser,
  deleteClient,
  deleteNode,
  deleteNodesBatch,
  deleteUser,
  getNodeDetails,
  revokeAgentToken,
  revokeAdminUserSession,
  rotateNodeSecret,
  setNodeMaintenance,
  updateClient,
  updateNode,
  updateSite,
  updateUser,
} from './api';

function buildAdminRedirectUrl(
  section: string,
  status: 'ok' | 'error',
  message: string,
  returnTo?: string,
): string {
  const params = new URLSearchParams({ section, status, message });
  const base =
    returnTo && returnTo.startsWith('/admin') ? returnTo.replace(/\?.*$/, '') : '/admin';
  return `${base}?${params.toString()}`;
}

const adminRedirect = (
  section: string,
  status: 'ok' | 'error',
  message: string,
  returnTo?: string,
): never => {
  redirect(buildAdminRedirectUrl(section, status, message, returnTo));
};

const normalizeOptional = (value: FormDataEntryValue | null): string | undefined => {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : undefined;
};

const rethrowIfRedirectError = (error: unknown): void => {
  if (isRedirectError(error)) {
    throw error;
  }
};

export async function createClientAction(formData: FormData): Promise<void> {
  try {
    const response = await createClient({
      name: String(formData.get('name') ?? '').trim(),
      status: (normalizeOptional(formData.get('status')) as 'active' | 'inactive' | undefined) ?? 'active',
    });

    revalidatePath('/admin');
    revalidatePath('/nodes');
    revalidatePath('/bootstrap');
    adminRedirect('client', 'ok', `Cliente ${response.client.code} criado.`);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao criar cliente';
    adminRedirect('client', 'error', message);
  }
}

export async function createSiteAction(formData: FormData): Promise<void> {
  try {
    const response = await createSite({
      client_id: String(formData.get('client_id') ?? '').trim(),
      name: String(formData.get('name') ?? '').trim(),
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
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao criar site';
    adminRedirect('site', 'error', message);
  }
}

export async function updateClientAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get('client_id') ?? '').trim();
  const returnTo = normalizeOptional(formData.get('returnTo'));

  if (!clientId) {
    redirect(returnTo && returnTo.startsWith('/admin') ? returnTo : '/admin');
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
    revalidatePath('/admin/clientes');
    revalidatePath('/nodes');
    adminRedirect('client-edit', 'ok', `Cliente ${response.client.code} atualizado.`, returnTo);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao atualizar cliente';
    adminRedirect('client-edit', 'error', message, returnTo);
  }
}

export type DeleteClientResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

export async function deleteClientAction(formData: FormData): Promise<DeleteClientResult> {
  const clientId = String(formData.get('client_id') ?? '').trim();
  const returnTo = normalizeOptional(formData.get('returnTo')) || '/admin/clientes';
  const baseUrl = returnTo.replace(/\?.*$/, '');

  if (!clientId) {
    redirect(returnTo);
  }

  try {
    await deleteClient(clientId);
    revalidatePath('/admin');
    revalidatePath('/admin/clientes');
    revalidatePath('/nodes');
    revalidatePath('/dashboard');
    revalidatePath('/bootstrap');
    return {
      ok: true,
      redirectUrl: `${baseUrl}?section=client-delete&status=ok&message=${encodeURIComponent('Cliente excluido')}`,
    };
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao excluir cliente';
    return { ok: false, error: message };
  }
}

export async function updateSiteAction(formData: FormData): Promise<void> {
  const siteId = String(formData.get('site_id') ?? '').trim();
  const returnTo = normalizeOptional(formData.get('returnTo'));

  if (!siteId) {
    redirect(returnTo && returnTo.startsWith('/admin') ? returnTo : '/admin');
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
    revalidatePath('/admin/clientes');
    revalidatePath('/nodes');
    adminRedirect('site-edit', 'ok', `Site ${response.site.code} atualizado.`, returnTo);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao atualizar site';
    adminRedirect('site-edit', 'error', message, returnTo);
  }
}

export async function createNodeAction(formData: FormData): Promise<void> {
  try {
    const siteId = String(formData.get('site_id') ?? '').trim();
    const clientId = String(formData.get('client_id') ?? '').trim();
    const payload: Parameters<typeof createNode>[0] = {
      hostname: String(formData.get('hostname') ?? '').trim(),
      display_name: normalizeOptional(formData.get('display_name')),
      management_ip: normalizeOptional(formData.get('management_ip')),
      wan_ip: normalizeOptional(formData.get('wan_ip')),
      ha_role: normalizeOptional(formData.get('ha_role')),
      maintenance_mode: String(formData.get('maintenance_mode') ?? '') === 'on',
    };
    if (siteId) {
      payload.site_id = siteId;
    } else if (clientId) {
      payload.client_id = clientId;
    }

    const response = await createNode(payload);

    revalidatePath('/admin');
    revalidatePath('/nodes');
    revalidatePath('/bootstrap');
    redirect(`/nodes/${response.node.id}?created=1`);
  } catch (error) {
    rethrowIfRedirectError(error);
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
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao criar usuario';
    adminRedirect('user', 'error', message);
  }
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const userId = String(formData.get('user_id') ?? '').trim();
  const returnTo = normalizeOptional(formData.get('returnTo'));

  if (!userId) {
    redirect(returnTo && returnTo.startsWith('/admin') ? returnTo : '/admin');
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
    revalidatePath('/admin/usuarios');
    adminRedirect('user-edit', 'ok', `Usuario ${response.user.email} atualizado.`, returnTo);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao atualizar usuario';
    adminRedirect('user-edit', 'error', message, returnTo);
  }
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const userId = String(formData.get('user_id') ?? '').trim();
  const returnTo = normalizeOptional(formData.get('returnTo')) || '/admin/usuarios';

  if (!userId) {
    redirect(returnTo);
  }

  try {
    await deleteUser(userId);
    revalidatePath('/admin');
    revalidatePath('/admin/usuarios');
    redirect(`${returnTo.replace(/\?.*$/, '')}?section=user-edit&status=ok&message=${encodeURIComponent('Usuario excluido')}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao excluir usuario';
    redirect(`${returnTo.replace(/\?.*$/, '')}?section=user-edit&status=error&message=${encodeURIComponent(message)}`);
  }
}

export async function revokeUserSessionAdminAction(formData: FormData): Promise<void> {
  const userId = String(formData.get('user_id') ?? '').trim();
  const sessionId = String(formData.get('session_id') ?? '').trim();
  const returnTo = normalizeOptional(formData.get('returnTo'));
  const base = returnTo && returnTo.startsWith('/admin') ? returnTo.replace(/\?.*$/, '') : '/admin';

  if (!userId || !sessionId) {
    redirect(`${base}?section=user-sessions&status=error&message=${encodeURIComponent('Sessao invalida')}`);
  }

  try {
    await revokeAdminUserSession(userId, sessionId);
    revalidatePath('/admin');
    revalidatePath('/admin/usuarios');
    revalidatePath('/sessions');
    redirect(`${base}?section=user-sessions&status=ok&message=${encodeURIComponent('Sessao revogada')}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao revogar sessao';
    redirect(`${base}?section=user-sessions&status=error&message=${encodeURIComponent(message)}`);
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
    rethrowIfRedirectError(error);
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
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error ? error.message : 'Falha ao atualizar maintenance mode';
    redirect(`/nodes/${nodeId}?maintenance_error=${encodeURIComponent(message)}`);
  }
}

export async function deleteNodeAction(nodeId: string): Promise<void> {
  if (!nodeId?.trim()) {
    redirect('/nodes');
  }
  try {
    await deleteNode(nodeId.trim());
    revalidatePath('/nodes');
    revalidatePath('/dashboard');
    revalidatePath('/admin');
    revalidatePath('/bootstrap');
    redirect('/nodes?deleted=1');
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao excluir host';
    redirect(`/nodes?delete_error=${encodeURIComponent(message)}`);
  }
}

export async function deleteNodesBatchAction(ids: string[]): Promise<void> {
  const trimmed = ids.filter((id) => id?.trim()).map((id) => id.trim());
  if (trimmed.length === 0) {
    redirect('/nodes?delete_error=Nenhum%20host%20selecionado');
  }
  try {
    await deleteNodesBatch(trimmed);
    revalidatePath('/nodes');
    revalidatePath('/dashboard');
    revalidatePath('/admin');
    revalidatePath('/bootstrap');
    redirect(`/nodes?deleted_batch=${trimmed.length}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : 'Falha ao excluir hosts';
    redirect(`/nodes?delete_error=${encodeURIComponent(message)}`);
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
      ha_role: normalizeOptional('ha_role'),
    });
    revalidatePath(`/nodes/${nodeId}`);
    revalidatePath('/nodes');
    revalidatePath('/dashboard');
    redirect(`/nodes/${nodeId}?updated=1`);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error ? error.message : 'Falha ao atualizar firewall';
    redirect(`/nodes/${nodeId}?update_error=${encodeURIComponent(message)}`);
  }
}

export type NodeOpenAlert = {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  opened_at: string;
};

export async function getNodeOpenAlertsAction(
  nodeId: string,
): Promise<{ alerts: NodeOpenAlert[] }> {
  const response = await getNodeDetails(nodeId);
  const open = (response.node.recent_alerts ?? []).filter(
    (a) => a.status === 'open',
  );
  return {
    alerts: open.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      description: a.description,
      opened_at: a.opened_at,
    })),
  };
}
