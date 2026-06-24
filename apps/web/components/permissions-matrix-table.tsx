'use client';

import { permissionGroupLabel, roleLabel } from '@/lib/rbac-labels';

export type PermissionsMatrixData = {
  generated_at: string;
  roles: string[];
  permissions: Array<{
    id: string;
    description: string | null;
  }>;
  role_permissions: Record<string, string[]>;
};

export function PermissionsMatrixTable({ data }: { data: PermissionsMatrixData }) {
  const rolePermissionSets = Object.fromEntries(
    data.roles.map((role) => [
      role,
      new Set(data.role_permissions[role] ?? []),
    ]),
  );

  const groupedPermissions = data.permissions.reduce<
    Array<{ group: string; items: PermissionsMatrixData['permissions'] }>
  >((acc, permission) => {
    const group = permissionGroupLabel(permission.id);
    const existing = acc.find((entry) => entry.group === group);
    if (existing) {
      existing.items.push(permission);
      return acc;
    }
    acc.push({ group, items: [permission] });
    return acc;
  }, []);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-800 bg-slate-950/50 font-mono text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-950/95 px-4 py-3">Permissão</th>
            {data.roles.map((role) => (
              <th key={role} className="px-4 py-3 text-center">
                {roleLabel(role)}
              </th>
            ))}
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
                  <p className="font-mono text-xs text-cyan-200">{permission.id}</p>
                  {permission.description ? (
                    <p className="mt-1 text-xs text-slate-500">{permission.description}</p>
                  ) : null}
                </td>
                {data.roles.map((role) => {
                  const enabled = rolePermissionSets[role]?.has(permission.id);
                  return (
                    <td key={`${permission.id}-${role}`} className="px-4 py-3 text-center">
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
                    </td>
                  );
                })}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
