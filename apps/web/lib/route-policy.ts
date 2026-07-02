export type RouteSession = {
  role: string;
  permissions: string[];
  hasGlobalClientScope?: boolean;
  mfaEnrollmentRequired?: boolean;
  mfaEnforcementBlocking?: boolean;
};

export type RouteRequirement = {
  permissions?: readonly string[];
  anyPermissions?: readonly string[];
  requiresGlobalClientScope?: boolean;
};

type RouteRule = {
  pattern: RegExp;
  requirement: RouteRequirement;
};

const ROUTE_RULES: RouteRule[] = [
  { pattern: /^\/dashboard(?:\/|$)/, requirement: { permissions: ['firewalls.view'] } },
  { pattern: /^\/nodes(?:\/|$)/, requirement: { permissions: ['firewalls.view'] } },
  { pattern: /^\/admin\/usuarios(?:\/|$)/, requirement: { permissions: ['users.view'] } },
  { pattern: /^\/admin\/permissoes(?:\/|$)/, requirement: { permissions: ['users.view'] } },
  { pattern: /^\/admin\/notificacoes(?:\/|$)/, requirement: { permissions: ['notifications.view'] } },
  { pattern: /^\/admin\/mfa-politica(?:\/|$)/, requirement: { permissions: ['security.mfa_policy.view'] } },
  { pattern: /^\/admin\/grupos(?:\/|$)/, requirement: { anyPermissions: ['tags.view', 'groups.view'] } },
  { pattern: /^\/admin\/clientes(?:\/|$)/, requirement: { permissions: ['clients.view'] } },
  { pattern: /^\/admin\/clientes-sites(?:\/|$)/, requirement: { permissions: ['clients.view'] } },
  {
    pattern: /^\/admin(?:\/|$)/,
    // PERM-001: cadastro top-level exige inventory.global (nao basta clients.create).
    requirement: { anyPermissions: ['inventory.global'] },
  },
  { pattern: /^\/audit(?:\/|$)/, requirement: { permissions: ['audit.view'] } },
  { pattern: /^\/bootstrap(?:\/|$)/, requirement: { permissions: ['bootstrap.view'] } },
  { pattern: /^\/alerts(?:\/|$)/, requirement: { permissions: ['alerts.view'] } },
  { pattern: /^\/backups(?:\/|$)/, requirement: { permissions: ['backups.view'] } },
];

function hasPermission(session: RouteSession, permission: string): boolean {
  return session.permissions.includes(permission);
}

export function evaluateRouteAccess(
  pathname: string,
  session: RouteSession,
): { allowed: boolean; redirectTo?: string } {
  for (const rule of ROUTE_RULES) {
    if (!rule.pattern.test(pathname)) {
      continue;
    }

    const { permissions, anyPermissions, requiresGlobalClientScope } = rule.requirement;

    if (requiresGlobalClientScope && !session.hasGlobalClientScope) {
      return { allowed: false, redirectTo: '/conta?access=denied' };
    }

    if (permissions?.length) {
      const allowed = permissions.every((permission) => hasPermission(session, permission));
      if (!allowed) {
        return { allowed: false, redirectTo: '/conta?access=denied' };
      }
    }

    if (anyPermissions?.length) {
      const allowed = anyPermissions.some((permission) => hasPermission(session, permission));
      if (!allowed) {
        return { allowed: false, redirectTo: '/conta?access=denied' };
      }
    }

    return { allowed: true };
  }

  return { allowed: true };
}

/** Primeira rota operacional permitida ao usuario autenticado (HOME-001). */
export function resolveDefaultAuthenticatedPath(
  permissions: string[],
  options?: { hasGlobalClientScope?: boolean },
): string {
  const groups = buildNavGroups(permissions, options);

  for (const group of groups) {
    if (group.id === 'account') {
      continue;
    }

    const first = group.items[0];
    if (first) {
      return first.href;
    }
  }

  return '/conta?access=denied';
}

export type NavGroup = {
  id: 'operation' | 'administration' | 'account';
  label: string;
  items: Array<{ href: string; label: string }>;
};

export function buildNavGroups(
  permissions: string[],
  options?: { hasGlobalClientScope?: boolean },
): NavGroup[] {
  const hasGlobalClientScope = options?.hasGlobalClientScope ?? false;
  const canViewFirewalls = permissions.includes('firewalls.view');

  const operationItems = [
    ...(canViewFirewalls
      ? [
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/nodes', label: 'Firewalls' },
        ]
      : []),
    ...(permissions.includes('backups.view')
      ? [{ href: '/backups', label: 'Backups' }]
      : []),
    ...(permissions.includes('alerts.view')
      ? [{ href: '/alerts', label: 'Alertas' }]
      : []),
    ...(permissions.includes('bootstrap.view')
      ? [{ href: '/bootstrap', label: 'Instalação' }]
      : []),
  ];

  const canAccessInventory =
    hasGlobalClientScope || permissions.includes('inventory.global');

  const adminItems = [
    ...(canAccessInventory ? [{ href: '/admin', label: 'Cadastro' }] : []),
    ...(permissions.includes('clients.view')
      ? [{ href: '/admin/clientes', label: 'Clientes' }]
      : []),
    ...(permissions.includes('users.view')
      ? [
          { href: '/admin/usuarios', label: 'Usuários' },
          { href: '/admin/permissoes', label: 'Permissões' },
        ]
      : []),
    ...(permissions.includes('notifications.view')
      ? [{ href: '/admin/notificacoes', label: 'Notificações' }]
      : []),
    ...(permissions.includes('security.mfa_policy.view')
      ? [{ href: '/admin/mfa-politica', label: 'Política MFA' }]
      : []),
    ...(permissions.includes('tags.view') || permissions.includes('groups.view')
      ? [{ href: '/admin/grupos', label: 'Grupos e tags' }]
      : []),
    ...(permissions.includes('audit.view')
      ? [{ href: '/audit', label: 'Auditoria' }]
      : []),
  ];

  const accountItems = [
    { href: '/conta', label: 'Minha conta' },
    { href: '/sessions', label: 'Sessões' },
  ];

  const groups: NavGroup[] = [];
  if (operationItems.length > 0) {
    groups.push({ id: 'operation', label: 'Operação', items: operationItems });
  }
  if (adminItems.length > 0) {
    groups.push({ id: 'administration', label: 'Administração', items: adminItems });
  }
  groups.push({ id: 'account', label: 'Conta', items: accountItems });
  return groups;
}
