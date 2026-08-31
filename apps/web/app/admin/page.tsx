import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { Badge, Card, PageSection } from '@/components/ui';
import { ApiError, getNodesFilters, getNodesList, getRolesList, getSession } from '@/lib/api';
import { AdminCadastroCards } from '@/components/admin-cadastro-cards';
import { hasPermission } from '@/lib/authz';
import { adminNavLinkClassName, adminShortcutLinkClassName } from '@/lib/admin-nav-styles';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const activeSection = typeof params.section === 'string' ? params.section : undefined;
  const status = typeof params.status === 'string' ? params.status : undefined;
  const message = typeof params.message === 'string' ? params.message : undefined;

  let session;
  let filterOptions;
  let nodes;
  let roles: Array<{ code: string; label: string }> = [];

  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  const permissions = session.permissions ?? [];

  if (
    !session.has_global_client_scope &&
    !hasPermission(permissions, 'inventory.global')
  ) {
    redirect('/conta?access=denied');
  }

  const canManageUsers = hasPermission(permissions, 'users.view');
  const canViewPermissions = hasPermission(permissions, 'users.view');

  try {
    const [filterOptionsResult, nodesResult] = await Promise.all([
      getNodesFilters(),
      getNodesList({ limit: 200 }),
    ]);
    filterOptions = filterOptionsResult;
    nodes = nodesResult;

    if (canManageUsers) {
      const rolesResult = await getRolesList();
      roles = rolesResult.items.map((role) => ({
        code: role.code,
        label: role.label,
      }));
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <div className="space-y-section">
      <PageHero
        eyebrow="Administração"
        title="Cadastro inicial"
        description="Novo cliente e novo firewall. Usuários, tokens e permissões nas seções abaixo."
        stats={[
          { label: 'Clientes', value: String(filterOptions.clients.length) },
          { label: 'Firewalls', value: String(nodes.items.length) },
        ]}
      />

      <PageSection title="Atalhos" description="Navegação rápida para áreas relacionadas.">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" className="font-mono uppercase tracking-wider">
              Atalhos
            </Badge>
            <Link href="/nodes" className={`${adminShortcutLinkClassName} border-cyan-500/30 bg-cyan-500/10 text-cyan-200`}>
              Ver firewalls
            </Link>
            <Link href="/admin/usuarios" className={adminShortcutLinkClassName}>
              Usuários
            </Link>
            {canViewPermissions ? (
              <Link href="/admin/permissoes" className={adminShortcutLinkClassName}>
                Permissões
              </Link>
            ) : null}
            <Link href="/admin/clientes" className={adminShortcutLinkClassName}>
              Clientes
            </Link>
            <Link href="/audit" className={adminShortcutLinkClassName}>
              Auditoria
            </Link>
          </div>
        </Card>
      </PageSection>

      <AdminCadastroCards
        filterOptions={filterOptions}
        nodes={nodes}
        roles={roles}
        canManageUsers={canManageUsers}
        activeSection={activeSection}
        status={status}
        message={message}
      />
    </div>
  );
}
