'use server';

import { revalidatePath } from 'next/cache';
import { createRole, deleteRole, setRolePermissions } from './api';

export async function createRoleAction(
  code: string,
  label: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await createRole({ code, label });
    revalidatePath('/admin/permissoes');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao criar perfil.',
    };
  }
}

export async function deleteRoleAction(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteRole(code);
    revalidatePath('/admin/permissoes');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao excluir perfil.',
    };
  }
}

export async function setRolePermissionsAction(
  code: string,
  permissionIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await setRolePermissions(code, permissionIds);
    revalidatePath('/admin/permissoes');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao salvar permissoes.',
    };
  }
}
