'use server';

import { getAdminUserSessions, getSession } from './api';
import { hasPermission } from './authz';

export async function getAdminUserSessionsAction(userId: string, query: { cursor?: string; limit?: number } = {}): Promise<
  | { ok: true; items: Awaited<ReturnType<typeof getAdminUserSessions>>['items']; next_cursor: string | null }
  | { ok: false; error: string }
> {
  if (!userId || userId.length > 128) {
    return { ok: false, error: 'Usuário inválido.' };
  }

  try {
    const session = await getSession();
    if (session.user.role !== 'superadmin' || !hasPermission(session.permissions ?? [], 'users.view')) {
      return { ok: false, error: 'Sem permissão para consultar sessões.' };
    }

    const response = await getAdminUserSessions(userId, query);
    return { ok: true, items: response.items, next_cursor: response.next_cursor };
  } catch {
    return { ok: false, error: 'Não foi possível consultar as sessões deste usuário. Tente novamente.' };
  }
}
