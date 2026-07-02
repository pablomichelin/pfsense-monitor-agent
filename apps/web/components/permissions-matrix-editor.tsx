'use client';

import { useMemo, useState } from 'react';
import {
  createRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
} from '@/lib/admin-permissions';
import type { PermissionsMatrixResponse } from '@/lib/api';
import { permissionGroupLabel, permissionLabel, roleLabel } from '@/lib/rbac-labels';

const SUPERADMIN_ROLE = 'superadmin';

type PermissionsMatrixEditorProps = {
  data: PermissionsMatrixResponse;
  canManage: boolean;
};

function buildMatrixState(data: PermissionsMatrixResponse): Record<string, Set<string>> {
  return Object.fromEntries(
    data.roles.map((role) => [
      role.code,
      new Set(data.role_permissions[role.code] ?? []),
    ]),
  );
}

export function PermissionsMatrixEditor({
  data,
  canManage,
}: PermissionsMatrixEditorProps) {
  const [savedMatrix, setSavedMatrix] = useState<Record<string, Set<string>>>(() =>
    buildMatrixState(data),
  );
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editingRoleMeta = data.roles.find((role) => role.code === editingRole);

  const groupedPermissions = useMemo(
    () =>
      data.permissions.reduce<
        Array<{ group: string; items: PermissionsMatrixResponse['permissions'] }>
      >((acc, permission) => {
        const group = permissionGroupLabel(permission.id);
        const existing = acc.find((entry) => entry.group === group);
        if (existing) {
          existing.items.push(permission);
          return acc;
        }
        acc.push({ group, items: [permission] });
        return acc;
      }, []),
    [data.permissions],
  );

  const startEditing = (roleCode: string) => {
    if (!canManage || roleCode === SUPERADMIN_ROLE) {
      return;
    }
    setEditingRole(roleCode);
    setDraftPermissions(new Set(savedMatrix[roleCode] ?? []));
    setFeedback(null);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingRole(null);
    setDraftPermissions(null);
  };

  const toggleDraftPermission = (permissionId: string, enabled: boolean) => {
    if (!draftPermissions) {
      return;
    }
    const next = new Set(draftPermissions);
    if (enabled) {
      next.add(permissionId);
    } else {
      next.delete(permissionId);
    }
    setDraftPermissions(next);
  };

  const saveEditing = async () => {
    if (!editingRole || !draftPermissions) {
      return;
    }

    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await setRolePermissionsAction(
        editingRole,
        Array.from(draftPermissions),
      );
      if (!result.ok) {
        throw new Error(result.error);
      }
      setSavedMatrix((current) => ({
        ...current,
        [editingRole]: new Set(draftPermissions),
      }));
      setFeedback(
        `Permissoes de ${editingRoleMeta?.label ?? roleLabel(editingRole)} salvas.`,
      );
      cancelEditing();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao salvar permissoes do perfil.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    setCreating(true);
    setError(null);
    setFeedback(null);
    try {
      const code = newCode.trim().toLowerCase();
      const label = newLabel.trim();
      const result = await createRoleAction(code, label);
      if (!result.ok) {
        throw new Error(result.error);
      }
      setSavedMatrix((current) => ({
        ...current,
        [code]: new Set<string>(),
      }));
      setNewCode('');
      setNewLabel('');
      setFeedback(`Perfil ${label} criado. Recarregue se não aparecer na lista.`);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Falha ao criar perfil.',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRole = async (roleCode: string) => {
    if (!canManage || !window.confirm(`Excluir o perfil ${roleLabel(roleCode)}?`)) {
      return;
    }

    if (editingRole === roleCode) {
      cancelEditing();
    }

    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await deleteRoleAction(roleCode);
      if (!result.ok) {
        throw new Error(result.error);
      }
      setFeedback(`Perfil ${roleLabel(roleCode)} excluido.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Falha ao excluir perfil.',
      );
    } finally {
      setSaving(false);
    }
  };

  const isRoleEditable = (roleCode: string) =>
    canManage && roleCode !== SUPERADMIN_ROLE;

  const permissionEnabled = (roleCode: string, permissionId: string) => {
    if (roleCode === SUPERADMIN_ROLE) {
      return true;
    }
    if (editingRole === roleCode && draftPermissions) {
      return draftPermissions.has(permissionId);
    }
    return savedMatrix[roleCode]?.has(permissionId) ?? false;
  };

  return (
    <div className="space-y-4">
      {canManage ? (
        <form
          onSubmit={handleCreateRole}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-700/80 bg-slate-950/30 p-3"
        >
          <div className="min-w-[10rem] flex-1">
            <label className="mb-1 block text-xs text-slate-500">Codigo do perfil</label>
            <input
              type="text"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
              placeholder="noc-operador"
              pattern="[a-z][a-z0-9-]*"
              required
              disabled={editingRole !== null}
              className="w-full rounded-lg border border-slate-600/80 bg-panel-soft px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className="mb-1 block text-xs text-slate-500">Nome exibido</label>
            <input
              type="text"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="NOC Operador"
              required
              disabled={editingRole !== null}
              className="w-full rounded-lg border border-slate-600/80 bg-panel-soft px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={creating || editingRole !== null}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            {creating ? 'Criando...' : 'Criar perfil'}
          </button>
        </form>
      ) : null}

      {editingRole && editingRoleMeta ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
          <p className="text-sm text-cyan-100">
            Editando permissoes de{' '}
            <span className="font-medium">
              {editingRoleMeta.label || roleLabel(editingRole)}
            </span>
            . Marque as permissoes desejadas e salve.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveEditing}
              disabled={saving}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar alteracoes'}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="rounded-lg border border-slate-600/80 bg-panel-soft px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? <p className="text-sm text-emerald-300">{feedback}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/50 font-mono text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-950/95 px-4 py-3">Permissão</th>
              {data.roles.map((role) => {
                const isEditing = editingRole === role.code;
                const editable = isRoleEditable(role.code);
                return (
                  <th
                    key={role.code}
                    className={`min-w-[9rem] px-3 py-3 text-center ${
                      isEditing ? 'bg-cyan-500/10' : ''
                    }`}
                  >
                    <div className="space-y-2">
                      <span className="block normal-case tracking-normal text-slate-300">
                        {role.label || roleLabel(role.code)}
                      </span>
                      {editable ? (
                        <div className="flex flex-col items-center gap-1">
                          {isEditing ? (
                            <span className="rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-[10px] normal-case tracking-normal text-cyan-200">
                              Em edicao
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditing(role.code)}
                              disabled={editingRole !== null || saving}
                              className="rounded border border-slate-600/80 bg-panel-soft px-2 py-1 text-[10px] normal-case tracking-normal text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200 disabled:opacity-50"
                            >
                              Editar
                            </button>
                          )}
                          {!role.is_system && !isEditing ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteRole(role.code)}
                              disabled={editingRole !== null || saving}
                              className="text-[10px] normal-case tracking-normal text-rose-300/80 transition hover:text-rose-200 disabled:opacity-50"
                            >
                              Excluir perfil
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {groupedPermissions.flatMap((group) => [
              <tr key={`group-${group.group}`} className="bg-slate-900/70">
                <td
                  colSpan={data.roles.length + 1}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300"
                >
                  {group.group}
                </td>
              </tr>,
              ...group.items.map((permission) => (
                <tr key={permission.id} className="bg-panel-soft/20">
                  <td className="sticky left-0 z-10 bg-panel-soft/95 px-4 py-3">
                    <p className="text-sm text-slate-200">
                      {permissionLabel(permission.id, permission.description)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-cyan-200/80">{permission.id}</p>
                  </td>
                  {data.roles.map((role) => {
                    const enabled = permissionEnabled(role.code, permission.id);
                    const isEditing = editingRole === role.code;
                    const showCheckbox = isEditing;
                    return (
                      <td
                        key={`${permission.id}-${role.code}`}
                        className={`px-3 py-3 text-center ${isEditing ? 'bg-cyan-500/5' : ''}`}
                      >
                        {showCheckbox ? (
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) =>
                              toggleDraftPermission(permission.id, event.target.checked)
                            }
                            className="rounded border-slate-600"
                            aria-label={`${permission.id} para ${role.label}`}
                          />
                        ) : (
                          <span
                            className={
                              enabled
                                ? 'inline-flex h-6 w-6 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                : 'inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-600'
                            }
                            aria-label={enabled ? 'Permitido' : 'Negado'}
                          >
                            {enabled ? '✓' : '—'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
