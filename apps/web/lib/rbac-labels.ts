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
  inventory: 'Cadastro',
  notifications: 'Notificações',
  security: 'Segurança',
  tags: 'Tags da frota',
  groups: 'Grupos da frota',
  service: 'Serviços',
  node: 'Firewall',
  pfsense: 'pfREST / pfSense API',
};

export const PERMISSION_LABELS: Record<string, string> = {
  'inventory.global': 'Menu Cadastro (criar clientes e firewalls)',
  'notifications.view': 'Visualizar notificações externas',
  'notifications.manage': 'Gerenciar canais e regras de notificação',
  'notifications.test': 'Testar canais de notificação',
  'tags.view': 'Visualizar tags da frota',
  'tags.manage': 'Gerenciar tags e associação a firewalls',
  'groups.view': 'Visualizar grupos ad-hoc de firewalls',
  'groups.manage': 'Gerenciar grupos ad-hoc e membros',
  'security.mfa_policy.view': 'Visualizar política MFA e conformidade',
  'security.mfa_policy.manage': 'Gerenciar política MFA (enforcement por perfil)',
  'backups.manage': 'Gerenciar retencao e drift de backups',
  'service.restart.run': 'Reiniciar serviços allowlistados no pfSense',
  'node.reboot.run': 'Reiniciar firewall (reboot controlado)',
  'package.upgrade.run': 'Disparar upgrade remoto do package',
  'pfsense.api.view': 'Visualizar capacidades pfREST',
  'pfsense.credentials.manage': 'Gerenciar credenciais pfREST (vault)',
  'pfsense.alias.view': 'Listar/comparar aliases pfREST (read-only)',
  'pfsense.alias.manage': 'Preparar alterações de aliases (preview)',
  'pfsense.alias.apply': 'Aplicar aliases via pfREST (piloto lab)',
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

export function permissionLabel(permissionId: string, description?: string | null): string {
  return PERMISSION_LABELS[permissionId] ?? description ?? permissionId;
}
