'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  getPackageUpgradeStatus,
  requestPackageUpgrade,
  type PackageUpgradeRequestResponse,
} from './api';

export type PackageUpgradeActionResult =
  | { ok: true; data: PackageUpgradeRequestResponse }
  | { ok: false; error: string; status?: number };

function mapPackageUpgradeRequestError(message: string): string {
  const normalized = message.trim().toLowerCase();

  if (normalized === 'node heartbeat is not recent') {
    return 'Heartbeat do firewall não está recente. Aguarde o agente reconectar.';
  }
  if (normalized === 'package upgrade already pending for this node') {
    return 'Já existe uma atualização de package em andamento para este firewall.';
  }
  if (normalized === 'agent already at target version') {
    return 'O agente já está na versão publicada.';
  }
  if (normalized.includes('agent version too old')) {
    return 'Versão do agente incompatível com upgrade remoto. Instale manualmente a versão 0.4.6+ uma vez; depois disso upgrades futuros serão remotos.';
  }
  if (normalized === 'package upgrade is disabled') {
    return 'Upgrade remoto de package desabilitado no controlador.';
  }
  if (normalized === 'global package upgrade concurrency limit reached') {
    return 'Limite global de upgrades simultâneos atingido. Tente novamente em alguns minutos.';
  }

  return message || 'Falha ao solicitar upgrade de package';
}

export async function pollPackageUpgradeStatusAction(nodeId: string) {
  return getPackageUpgradeStatus(nodeId);
}

export async function requestPackageUpgradeAction(
  nodeId: string,
): Promise<PackageUpgradeActionResult> {
  try {
    const result = await requestPackageUpgrade(nodeId);
    revalidatePath(`/nodes/${nodeId}`);
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        error: mapPackageUpgradeRequestError(error.message),
        status: error.status,
      };
    }

    return { ok: false, error: 'Falha ao solicitar upgrade de package' };
  }
}
