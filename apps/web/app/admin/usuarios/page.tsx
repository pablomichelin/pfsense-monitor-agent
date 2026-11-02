import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHero } from '@/components/page-hero';
import { AdminSectionMessage } from '@/components/admin-section-message';
import { AdminUsuariosTabs } from '@/components/admin-usuarios-tabs';
import { Card, PageSection } from '@/components/ui';
import {
  ApiError,
  getAdminClientsList,
  getRolesList,
  getSession,
  getUsersList,
} from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';

export const dynamic = 'force-dynamic';

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const activeSection = typeof params.section === 'string' ? params.section : undefined;
  const initialTab = typeof params.tab === 'string' ? params.tab : undefined;
  const search = typeof params.search === 'string' ? params.search.trim().slice(0, 200) : '';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
  const status = typeof params.status === 'string' ? params.status : undefined;
  const message = typeof params.message === 'string' ? params.message : undefined;
  const showInactive = params.showInactive === '1' || params.showInactive === 'true';
  const selectedUserId = typeof params.selected === 'string' ? params.selected : undefined;
  const sessionRevision = typeof params.rev === 'string' ? params.rev : undefined;

  let session;
  let users: Awaited<ReturnType<typeof getUsersList>>;
  let clients: Array<{ id: string; name: string; code: string }> = [];
  let roles: Array<{ code: string; label: string }> = [];

  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  if (session.user.role !== 'superadmin' || !hasPermission(session.permissions ?? [], 'users.view')) {
    redirect('/conta?access=denied');
  }

  try {
    const [usersResponse, firstClients, rolesResponse] = await Promise.all([
      getUsersList({ status: showInactive ? 'inactive' : 'active', search, cursor, limit: 50 }),
      getAdminClientsList({ status: 'active', page: 1, limit: 100 }),
      getRolesList(),
    ]);
    users = usersResponse;
    clients = firstClients.items.map(({ id, name, code }) => ({ id, name, code }));
    // O seletor de escopo não pode perder clientes após a primeira página.
    for (let page = 2; page <= firstClients.total_pages; page++) {
      const result = await getAdminClientsList({ status: 'active', page, limit: 100 });
      clients.push(...result.items.map(({ id, name, code }) => ({ id, name, code })));
    }
    roles = rolesResponse.items.map((role) => ({
      code: role.code,
      label: role.label,
    }));
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
        title="Usuários"
        description="Gestão de acesso e sessões, com edição de um usuário por vez."
        stats={[
          { label: 'Usuários', value: String(users.total) },
        ]}
      />

      <PageSection title="Navegação">
        <div className="flex flex-wrap gap-3">
          <Link href="/admin" className={adminNavLinkClassName}>
            ← Cadastro
          </Link>
          <Link href="/admin/permissoes" className={adminNavLinkClassName}>
            Permissões
          </Link>
          <Link href="/admin/mfa-politica" className={adminNavLinkClassName}>
            Política MFA
          </Link>
        </div>
      </PageSection>

      <PageSection
        title="Gestão de usuários"
        description={showInactive ? 'Exibindo usuários inativos.' : 'Exibindo usuários ativos.'}
      >
        <Card className="p-4">
          <AdminUsuariosTabs
            key={`${showInactive ? 'inactive' : 'active'}:${search}:${cursor ?? ''}`}
            users={users.items.map((u) => ({
              id: u.id,
              email: u.email,
              display_name: u.display_name ?? null,
              role: u.role,
              status: u.status,
              client_ids: u.client_ids ?? [],
              client_id: u.client_id ?? null,
              mfa_enabled: u.mfa_enabled,
              mfa_enforcement_required: u.mfa_enforcement_required,
              mfa_recovery_codes_remaining: u.mfa_recovery_codes_remaining,
            }))}
            clients={clients}
            roles={roles}
            canManageUsers={hasPermission(session.permissions ?? [], 'users.update')}
            canDeleteUsers={hasPermission(session.permissions ?? [], 'users.delete')}
            currentUserId={session.user.id}
            showInactive={showInactive}
            initialUserId={selectedUserId}
            initialTab={initialTab}
            search={search}
            cursor={cursor}
            nextCursor={users.next_cursor}
            total={users.total}
            sessionRevision={sessionRevision}
            activeSection={activeSection}
            status={status}
            message={message}
            SectionMessage={AdminSectionMessage}
          />
        </Card>
      </PageSection>
    </div>
  );
}
