export type RouteSession = {
  role: string;
  permissions: string[];
};

export type RouteRequirement = {
  permissions?: readonly string[];
  anyPermissions?: readonly string[];
};

type RouteRule = {
  pattern: RegExp;
  requirement: RouteRequirement;
};

const ROUTE_RULES: RouteRule[] = [
  { pattern: /^\/admin\/usuarios(?:\/|$)/, requirement: { permissions: ['users.view'] } },
  { pattern: /^\/admin\/permissoes(?:\/|$)/, requirement: { permissions: ['users.view'] } },
  { pattern: /^\/admin\/clientes(?:\/|$)/, requirement: { permissions: ['clients.view'] } },
  { pattern: /^\/admin\/clientes-sites(?:\/|$)/, requirement: { permissions: ['clients.view'] } },
  { pattern: /^\/admin(?:\/|$)/, requirement: { permissions: ['clients.create'] } },
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

    const { permissions, anyPermissions } = rule.requirement;

    if (permissions?.length) {
      const allowed = permissions.every((permission) => hasPermission(session, permission));
      if (!allowed) {
        return { allowed: false, redirectTo: '/dashboard' };
      }
    }

    if (anyPermissions?.length) {
      const allowed = anyPermissions.some((permission) => hasPermission(session, permission));
      if (!allowed) {
        return { allowed: false, redirectTo: '/dashboard' };
      }
    }

    return { allowed: true };
  }

  return { allowed: true };
}

export type NavGroup = {
  id: 'operation' | 'administration' | 'account';
  label: string;
  items: Array<{ href: string; label: string }>;
};

export function buildNavGroups(permissions: string[]): NavGroup[] {
  const operationItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/nodes', label: 'Firewalls' },
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

  const adminItems = [
    ...(permissions.includes('clients.create')
      ? [{ href: '/admin', label: 'Cadastro' }]
      : []),
    ...(permissions.includes('clients.view')
      ? [{ href: '/admin/clientes', label: 'Clientes' }]
      : []),
    ...(permissions.includes('users.view')
      ? [
          { href: '/admin/usuarios', label: 'Usuários' },
          { href: '/admin/permissoes', label: 'Permissões' },
        ]
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
