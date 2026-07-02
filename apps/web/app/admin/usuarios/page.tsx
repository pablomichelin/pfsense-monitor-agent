import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHero } from '@/components/page-hero';
import { AdminSectionMessage } from '@/components/admin-section-message';
import { AdminUsuariosTabs } from '@/components/admin-usuarios-tabs';
import { Card, PageSection } from '@/components/ui';
import {
  ApiError,
  getAdminUserSessions,
  getNodesFilters,
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
  const status = typeof params.status === 'string' ? params.status : undefined;
  const message = typeof params.message === 'string' ? params.message : undefined;
  const showInactive = params.showInactive === '1' || params.showInactive === 'true';

  let session;
  let users = { items: [] as Awaited<ReturnType<typeof getUsersList>>['items'] };
  let clients: Array<{ id: string; name: string; code: string }> = [];
  let roles: Array<{ code: string; label: string }> = [];
  let userSessionsByUserId = new Map<string, Awaited<ReturnType<typeof getAdminUserSessions>>['items']>();

  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  if (!hasPermission(session.permissions ?? [], 'users.view')) {
    redirect('/admin');
  }

  try {
    const [usersResponse, filterOptions, rolesResponse] = await Promise.all([
      getUsersList(showInactive ? { status: 'inactive' } : undefined),
      getNodesFilters(),
      getRolesList(),
    ]);
    users = usersResponse;
    clients = filterOptions.clients.map((client) => ({
      id: client.id,
      name: client.name,
      code: client.code,
    }));
    roles = rolesResponse.items.map((role) => ({
      code: role.code,
      label: role.label,
    }));
    const sessionsEntries = await Promise.all(
      users.items.map(
        async (user) => [user.id, (await getAdminUserSessions(user.id)).items] as const,
      ),
    );
    userSessionsByUserId = new Map(sessionsEntries);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  const totalSessions = Array.from(userSessionsByUserId.values()).reduce((acc, s) => acc + s.length, 0);

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Administração"
        title="Usuários"
        description="Gestão de acesso e sessões. Abas: Usuários e Sessões."
        stats={[
          { label: 'Usuários', value: String(users.items.length) },
          { label: 'Sessões', value: String(totalSessions) },
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

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
        {showInactive ? (
          <Link href="/admin/usuarios" className="text-cyan-400 hover:text-cyan-300">
            Ver apenas ativos
          </Link>
        ) : (
          <Link href="/admin/usuarios?showInactive=1" className="text-cyan-400 hover:text-cyan-300">
            Ver inativos
          </Link>
        )}
      </div>

      <PageSection
        title="Gestão de usuários"
        description={showInactive ? 'Exibindo usuários inativos.' : 'Exibindo usuários ativos.'}
      >
        <Card className="p-4">
          <AdminUsuariosTabs
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
            currentUserId={session.user.id}
            userSessionsByUserId={Object.fromEntries(userSessionsByUserId)}
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
