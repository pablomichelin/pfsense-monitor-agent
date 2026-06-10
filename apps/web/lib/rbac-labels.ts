export const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadministrador',
  admin: 'Administrador',
  operator: 'Operador',
  readonly: 'Somente leitura',
  client: 'Cliente',
};

export const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
};

export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  clients: 'Clientes',
  firewalls: 'Firewalls',
  backups: 'Backups',
  users: 'Usuários',
  roles: 'Perfis',
  audit: 'Auditoria',
  settings: 'Configurações',
  bootstrap: 'Instalação',
  alerts: 'Alertas',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function permissionGroupLabel(permissionId: string): string {
  const group = permissionId.split('.')[0] ?? permissionId;
  return PERMISSION_GROUP_LABELS[group] ?? group;
}
