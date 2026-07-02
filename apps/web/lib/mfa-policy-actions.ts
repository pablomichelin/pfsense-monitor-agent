'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, updateMfaPolicy } from '@/lib/api';
import type { MfaPolicyResponse } from '@/lib/mfa-policy';

export type MfaPolicyActionResult =
  | { ok: true; data: MfaPolicyResponse }
  | { ok: false; error: string; status?: number };

function mapError(error: unknown, fallback: string): MfaPolicyActionResult {
  if (error instanceof ApiError) {
    return { ok: false, error: error.message, status: error.status };
  }

  return {
    ok: false,
    error: error instanceof Error ? error.message : fallback,
  };
}

function revalidateMfaPolicyPages() {
  revalidatePath('/admin/mfa-politica');
  revalidatePath('/admin/usuarios');
}

export async function updateMfaPolicyAction(
  formData: FormData,
): Promise<MfaPolicyActionResult> {
  const enforcedRoles = formData
    .getAll('enforced_roles')
    .map((value) => String(value).trim())
    .filter(Boolean);
  const blockingRaw = String(formData.get('enforcement_blocking') ?? '').trim();
  const enforcementBlocking =
    blockingRaw === 'true' ? true : blockingRaw === 'false' ? false : undefined;

  try {
    const data = await updateMfaPolicy({
      enforced_roles: enforcedRoles,
      ...(enforcementBlocking !== undefined
        ? { enforcement_blocking: enforcementBlocking }
        : {}),
    });
    revalidateMfaPolicyPages();
    return { ok: true, data };
  } catch (error) {
    return mapError(error, 'Falha ao atualizar politica MFA');
  }
}
