'use server';

import { isIP } from 'node:net';
import { revalidatePath } from 'next/cache';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import {
  createBackupBatch,
  getOperationalActionsStatus,
  requestNodeReboot,
  requestServiceRestart,
  requestTableSearch,
  requestTableEntryRemove,
} from './api';
import { interpretTableTarget } from './table-ip';

const INVALID_IP_MESSAGE =
  'Informe um IPv4 ou IPv6 válido. Ex.: 203.0.113.10';

export type TableActionResult =
  | {
      ok: true;
      command_id: string;
      status: string;
      expires_at: string;
      ip: string;
      table?: string;
    }
  | { ok: false; error: string; code?: 'invalid_ip' };

function mapTableActionError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('ip must be a valid') || message.includes('invalid ip')) {
    return INVALID_IP_MESSAGE;
  }
  if (message.includes('network prefix requires agent')) {
    return 'Desbloquear uma rede exige o agente 0.5.24 ou superior neste firewall.';
  }
  if (message.includes('block list requires agent')) {
    return 'Listar bloqueios exige o agente 0.5.25 ou superior neste firewall.';
  }
  if (message.includes('ip is required')) return 'Informe o IP a desbloquear.';
  if (message.includes('allow list and cannot be removed')) {
    return 'ips_liberados é a lista de liberação e não entra no desbloqueio.';
  }
  if (message.includes('confirm_ip must match')) {
    return 'A confirmação precisa ser igual ao IP consultado.';
  }
  if (message.includes('node heartbeat is not recent')) {
    return 'Este firewall não enviou heartbeat recente.';
  }
  if (message.includes('agent version below minimum')) {
    return 'O agente deste firewall está abaixo da versão mínima para desbloquear IP.';
  }
  if (message.includes('operational actions are disabled')) {
    return 'As ações operacionais estão desligadas no controlador.';
  }
  if (message.includes('node not found')) return 'Firewall não encontrado.';
  if (message.includes('demorou mais')) return message;
  if (
    message.includes('Server Components render') ||
    message.includes('omitted in production')
  ) {
    return 'A solicitação falhou no painel. Tente de novo; se repetir, confira o IP informado.';
  }
  return message || 'Falha ao solicitar a ação no firewall.';
}

function acceptedTableIp(raw: string, prefix = 32): { ip: string } | { error: string } {
  const interpreted = interpretTableTarget(raw, prefix);
  if ('error' in interpreted) return interpreted;
  const host = interpreted.target.split('/')[0] ?? interpreted.target;
  if (isIP(host) === 0) return { error: INVALID_IP_MESSAGE };
  return { ip: interpreted.target };
}

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

export async function requestTableListAction(nodeId: string): Promise<TableActionResult> {
  try {
    const result = await requestTableSearch(nodeId, { mode: 'list' });
    revalidatePath(`/nodes/${nodeId}`);
    return { ok: true, ...result, ip: result.ip ?? '' };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: mapTableActionError(error) };
  }
}

export async function requestTableSearchAction(
  nodeId: string,
  ip: string,
  prefix = 32,
): Promise<TableActionResult> {
  const accepted = acceptedTableIp(ip, prefix);
  if ('error' in accepted) {
    return { ok: false, error: accepted.error, code: 'invalid_ip' };
  }
  try {
    const result = await requestTableSearch(nodeId, { ip: accepted.ip });
    revalidatePath(`/nodes/${nodeId}`);
    return {
      ok: true,
      command_id: result.command_id,
      status: result.status,
      expires_at: result.expires_at,
      ip: accepted.ip,
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: mapTableActionError(error) };
  }
}

export async function requestTableEntryRemoveAction(
  nodeId: string,
  table: string,
  ip: string,
  confirmIp: string,
  prefix = 32,
): Promise<TableActionResult> {
  const accepted = acceptedTableIp(ip, prefix);
  if ('error' in accepted) {
    return { ok: false, error: accepted.error, code: 'invalid_ip' };
  }
  if (confirmIp.trim() !== accepted.ip) {
    return { ok: false, error: 'A confirmação precisa ser igual ao IP consultado.' };
  }
  try {
    const result = await requestTableEntryRemove(nodeId, {
      table,
      ip: accepted.ip,
      confirm_ip: accepted.ip,
    });
    revalidatePath(`/nodes/${nodeId}`);
    return {
      ok: true,
      command_id: result.command_id,
      status: result.status,
      expires_at: result.expires_at,
      ip: accepted.ip,
      table,
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: mapTableActionError(error) };
  }
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
