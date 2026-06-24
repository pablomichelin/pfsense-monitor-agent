/**
 * Rotas alvo para capturas visuais (auditoria 108).
 * Usado por visual-smoke.spec.mjs e pipelines futuros.
 */
export const VISUAL_SMOKE_ROUTES = [
  { path: '/login', auth: false, name: 'login' },
  { path: '/dashboard', auth: true, name: 'dashboard' },
  { path: '/nodes', auth: true, name: 'nodes' },
  { path: '/backups', auth: true, name: 'backups' },
  { path: '/alerts', auth: true, name: 'alerts' },
  { path: '/audit', auth: true, name: 'audit' },
  { path: '/conta', auth: true, name: 'conta' },
  { path: '/admin', auth: true, name: 'admin' },
  { path: '/admin/usuarios', auth: true, name: 'admin-usuarios' },
  { path: '/admin/clientes', auth: true, name: 'admin-clientes' },
  { path: '/admin/permissoes', auth: true, name: 'admin-permissoes' },
  { path: '/sessions', auth: true, name: 'sessions' },
  { path: '/bootstrap', auth: true, name: 'bootstrap' },
] as const;
