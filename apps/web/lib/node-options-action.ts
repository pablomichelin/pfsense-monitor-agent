'use server';

import { getNodesList, type NodesListResponse } from './api';

export async function searchNodeOptions(query: { search?: string; cursor?: string; client_id?: string }): Promise<
  { ok: true; result: NodesListResponse } | { ok: false; error: string }
> {
  try {
    // apiFetch forwards the current session; API remains the RBAC authority.
    return { ok: true, result: await getNodesList({ ...query, limit: 50, sort_by: 'name', sort_order: 'asc' }) };
  } catch {
    return { ok: false, error: 'Não foi possível buscar firewalls. Tente novamente ou renove sua sessão.' };
  }
}
