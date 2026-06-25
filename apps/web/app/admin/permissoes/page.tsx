import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { PermissionsMatrixEditor } from '@/components/permissions-matrix-editor';
import { Card, PageSection } from '@/components/ui';
import { getPermissionsMatrix, getSession } from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';

export const dynamic = 'force-dynamic';

export default async function AdminPermissoesPage() {
  let session;
  let matrix;

  try {
    session = await getSession();
  } catch (error) {
    handlePageApiError(error);
  }

  if (!hasPermission(session.permissions ?? [], 'users.view')) {
    redirect('/conta?access=denied');
  }

  const canManage = hasPermission(session.permissions ?? [], 'roles.manage');

  try {
    matrix = await getPermissionsMatrix();
  } catch (error) {
    handlePageApiError(error);
  }

  return (
    <div className="space-y-8">
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
        <Link href="/admin/usuarios" className={adminNavLinkClassName}>
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
