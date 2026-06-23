'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  getPfsenseUpgradeStatus,
  requestPfsenseUpgrade,
  type PfsenseUpgradeRequestResponse,
} from './api';

export type PfsenseUpgradeActionResult =
  | { ok: true; data: PfsenseUpgradeRequestResponse }
  | { ok: false; error: string; status?: number };

function mapUpgradeRequestError(message: string, status?: number): string {
  const normalized = message.trim().toLowerCase();

  if (normalized === 'no pfsense update available') {
    return 'O controlador não vê mais atualização disponível para este firewall. Aguarde o próximo heartbeat ou execute upgrade-check --force no pfSense.';
  }
  if (normalized === 'node heartbeat is not recent') {
    return 'Heartbeat do firewall não está recente. Aguarde o agente reconectar.';
  }
  if (normalized === 'update check is stale') {
    return 'A última verificação de atualização está desatualizada. Aguarde nova checagem do agente.';
  }
  if (normalized === 'upgrade already pending for this node') {
    return 'Já existe um upgrade em andamento para este firewall.';
  }
  if (normalized === 'agent version too old') {
    return 'Versão do agente incompatível. Atualize o package SystemUp Monitor no pfSense.';
  }
  if (normalized === 'upgrade blocked on ha node') {
    return 'Upgrade bloqueado em nó com alta disponibilidade (HA/CARP).';
  }
  if (normalized === 'major branch upgrade not supported remotely') {
    return 'Upgrade de branch principal não é suportado remotamente.';
  }
  if (normalized === 'pfsense upgrade is disabled') {
    return 'Upgrade remoto desabilitado no controlador.';
  }
  if (status === 409 && normalized.includes('no_recent_backup')) {
    return 'Backup recente obrigatório. Confirme que aceita prosseguir sem backup recente.';
  }

  return message || 'Falha ao solicitar upgrade';
}

export async function pollPfsenseUpgradeStatusAction(nodeId: string) {
  return getPfsenseUpgradeStatus(nodeId);
}

export async function requestPfsenseUpgradeAction(
  nodeId: string,
  body: {
    enable_maintenance_mode?: boolean;
    acknowledge_no_recent_backup?: boolean;
  },
): Promise<PfsenseUpgradeActionResult> {
  try {
    const result = await requestPfsenseUpgrade(nodeId, body);
    revalidatePath(`/nodes/${nodeId}`);
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        error: mapUpgradeRequestError(error.message, error.status),
        status: error.status,
      };
    }

    return { ok: false, error: 'Falha ao solicitar upgrade' };
  }
}
