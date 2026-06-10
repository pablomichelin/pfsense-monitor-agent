import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { PermissionsMatrixEditor } from '@/components/permissions-matrix-editor';
import { Card, PageSection } from '@/components/ui';
import { ApiError, getPermissionsMatrix, getSession } from '@/lib/api';
import { hasPermission } from '@/lib/authz';

export const dynamic = 'force-dynamic';

const navLinkClassName =
  'inline-flex h-9 min-h-9 items-center justify-center rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-white';

export default async function AdminPermissoesPage() {
  let session;
  let matrix;

  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  if (!hasPermission(session.permissions ?? [], 'users.view')) {
    redirect('/dashboard');
  }

  const canManage = hasPermission(session.permissions ?? [], 'roles.manage');

  try {
    matrix = await getPermissionsMatrix();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Administração"
        title="Matriz de permissões"
        description={
          canManage
            ? 'Gerencie perfis e permissões do controlador. Superadministrador permanece com acesso total.'
            : 'Visualização dos perfis e permissões do controlador.'
        }
        stats={[
          { label: 'Perfis', value: String(matrix.roles.length) },
          { label: 'Permissões', value: String(matrix.permissions.length) },
        ]}
      />

      <PageSection title="Navegação">
        <Link href="/admin/usuarios" className={navLinkClassName}>
          ← Usuários
        </Link>
      </PageSection>

      <PageSection
        title="Matriz RBAC"
        description={`Atualizado em ${new Date(matrix.generated_at).toLocaleString('pt-BR')}.${
          canManage
            ? ' Clique em Editar no perfil desejado para alterar permissões.'
            : ' Você possui apenas visualização nesta tela.'
        }`}
      >
        <Card className="p-4">
          <PermissionsMatrixEditor data={matrix} canManage={canManage} />
        </Card>
      </PageSection>
    </div>
  );
}
