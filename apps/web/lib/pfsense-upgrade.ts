'use server';

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  getPfsenseUpgradeStatus,
  requestPfsenseUpgrade,
  requestPfsenseUpdateRefreshCheck,
  requestPfsenseRepoRepair,
  requestPfsenseSetBranch,
  type PfsenseUpgradeRefreshCheckResponse,
  type PfsenseUpgradeRequestResponse,
  type PfsenseUpdateBranchTarget,
} from './api';

export type PfsenseUpgradeActionResult =
  | { ok: true; data: PfsenseUpgradeRequestResponse }
  | { ok: false; error: string; status?: number };

export type PfsenseUpgradeRefreshActionResult =
  | { ok: true; data: PfsenseUpgradeRefreshCheckResponse }
  | { ok: false; error: string; status?: number };

function mapUpgradeRequestError(message: string, status?: number): string {
  const normalized = message.trim().toLowerCase();

  if (normalized === 'no pfsense update available') {
    return 'O controlador não vê atualização disponível. Use “Atualizar verificação” para renovar os repositórios pkg e checar de novo.';
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
  if (normalized === 'agent version too old for repo refresh check') {
    return 'Este agente ainda não atualiza os repositórios pkg. Atualize o package SystemUp Monitor para 0.5.12+ e tente de novo.';
  }
  if (normalized === 'refresh already requested') {
    return 'A verificação já foi pedida. Aguarde o próximo heartbeat do firewall (~30s).';
  }
  if (normalized === 'agent version too old for repo repair') {
    return 'Este agente ainda não repara o repositório pkg. Atualize o package SystemUp Monitor para 0.5.13+ e tente de novo.';
  }
  if (normalized === 'repo repair already requested') {
    return 'O reparo do repositório já foi pedido. Aguarde o próximo heartbeat (~30s).';
  }
  if (normalized === 'agent version too old for firmware branch') {
    return 'Este agente ainda não troca o firmware branch. Atualize o package SystemUp Monitor para 0.5.14+ e tente de novo.';
  }
  if (normalized === 'firmware branch change already requested') {
    return 'A troca de branch já foi pedida. Aguarde o próximo heartbeat (~30s).';
  }
  if (normalized.includes('target_branch must be one of')) {
    return 'Branch inválido. Escolha Latest stable, 2.8.1 ou 2.9.0.';
  }
  if (normalized.includes('set_pfsense_update_branch.php')) {
    return 'O helper de firmware branch do 0.5.14 ficou sem permissão de execução. Atualize o package SystemUp Monitor para 0.5.15+ e tente de novo.';
  }
  if (status === 409 && normalized.includes('no_recent_backup')) {
    return 'Backup recente obrigatório. Confirme que aceita prosseguir sem backup recente.';
  }

  return message || 'Falha ao solicitar upgrade';
}

export async function pollPfsenseUpgradeStatusAction(nodeId: string) {
  return getPfsenseUpgradeStatus(nodeId);
}

export async function requestPfsenseUpdateRefreshCheckAction(
  nodeId: string,
): Promise<PfsenseUpgradeRefreshActionResult> {
  try {
    const result = await requestPfsenseUpdateRefreshCheck(nodeId);
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

    return { ok: false, error: 'Falha ao solicitar nova verificação' };
  }
}

export async function requestPfsenseRepoRepairAction(
  nodeId: string,
): Promise<PfsenseUpgradeRefreshActionResult> {
  try {
    const result = await requestPfsenseRepoRepair(nodeId);
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

    return { ok: false, error: 'Falha ao solicitar reparo do repositório' };
  }
}

export async function requestPfsenseSetBranchAction(
  nodeId: string,
  targetBranch: PfsenseUpdateBranchTarget,
): Promise<PfsenseUpgradeRefreshActionResult> {
  try {
    const result = await requestPfsenseSetBranch(nodeId, targetBranch);
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

    return { ok: false, error: 'Falha ao solicitar troca do firmware branch' };
  }
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
