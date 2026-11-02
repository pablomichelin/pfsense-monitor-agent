'use client';

import { useState } from 'react';
import { ClientScopePicker } from '@/components/client-scope-picker';
import { roleLabel, statusLabel } from '@/lib/rbac-labels';

type ClientOption = {
  id: string;
  name: string;
  code: string;
};

type RoleOption = {
  code: string;
  label: string;
};

type RoleScopeFieldsProps = {
  clients: ClientOption[];
  roles?: RoleOption[];
  defaultRole?: string;
  defaultStatus?: string;
  defaultClientId?: string | null;
  defaultClientIds?: string[];
  roleSelectName?: string;
  statusSelectName?: string;
  inputClass: string;
  selectClass: string;
  onScopeChange?: () => void;
};

function ClientSinglePicker({
  clients,
  selectedId,
  selectClass,
  onSelectionChange,
}: {
  clients: ClientOption[];
  selectedId: string | null;
  onSelectionChange?: () => void;
  selectClass: string;
}) {
  const selectedAvailable = Boolean(selectedId && clients.some((client) => client.id === selectedId));

  return (
    <div className="w-full rounded-lg border border-slate-700/80 bg-slate-950/30 p-2">
      <p className="mb-2 text-xs font-medium text-slate-400">Empresa vinculada</p>
      {selectedId && !selectedAvailable ? <p className="mb-2 text-xs text-warning-fg">Vínculo histórico preservado. Você pode editar a identidade sem mudar esta empresa. Para alterar o vínculo, escolha um cliente ativo.</p> : null}
      <select
        name="client_id"
        aria-label="Cliente único vinculado ao usuário"
        defaultValue={selectedId ?? ''}
        onChange={onSelectionChange}
        required
        className={selectClass}
      >
        <option value="" disabled>
          Selecione o cliente
        </option>
        {selectedId && !selectedAvailable ? <option value={selectedId}>Cliente indisponível (vínculo preservado)</option> : null}
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name} ({client.code})
          </option>
        ))}
      </select>
    </div>
  );
}

const DEFAULT_ROLES: RoleOption[] = [
  { code: 'readonly', label: roleLabel('readonly') },
  { code: 'operator', label: roleLabel('operator') },
  { code: 'admin', label: roleLabel('admin') },
  { code: 'client', label: roleLabel('client') },
  { code: 'superadmin', label: roleLabel('superadmin') },
];

export function RoleScopeFields({
  clients,
  roles = DEFAULT_ROLES,
  defaultRole = 'readonly',
  defaultStatus = 'active',
  defaultClientId = null,
  defaultClientIds = [],
  roleSelectName = 'role',
  statusSelectName = 'status',
  inputClass,
  selectClass,
  onScopeChange,
}: RoleScopeFieldsProps) {
  const [role, setRole] = useState(defaultRole);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          name={roleSelectName}
          aria-label="Perfil de acesso"
          defaultValue={defaultRole}
          onChange={(event) => { setRole(event.target.value); onScopeChange?.(); }}
          className={selectClass}
        >
          {roles.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label || roleLabel(item.code)}
            </option>
          ))}
        </select>
        <select
          name={statusSelectName}
          aria-label="Status do usuário"
          defaultValue={defaultStatus}
          className={selectClass}
        >
          <option value="active">{statusLabel('active')}</option>
          <option value="inactive">{statusLabel('inactive')}</option>
        </select>
      </div>
      {role === 'client' ? (
        <ClientSinglePicker
          clients={clients}
          selectedId={defaultRole === 'client' ? defaultClientId : null}
          selectClass={selectClass}
          onSelectionChange={onScopeChange}
        />
      ) : role !== 'superadmin' ? (
        <ClientScopePicker clients={clients} selectedIds={defaultClientIds} onSelectionChange={onScopeChange} />
      ) : (
        <p className="w-full text-xs text-slate-500">
          Superadministrador tem escopo global; não usa vínculo por cliente.
        </p>
      )}
    </div>
  );
}
