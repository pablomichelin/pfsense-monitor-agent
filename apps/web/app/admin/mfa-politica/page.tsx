import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MfaPolicyAdminPanel } from '@/components/mfa-policy-admin-panel';
import { PageHero } from '@/components/page-hero';
import { PageSection } from '@/components/ui';
import { getMfaPolicy, getSession } from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { mfaModeLabel } from '@/lib/mfa-policy';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';

export const dynamic = 'force-dynamic';

export default async function AdminMfaPoliticaPage() {
  let session;

  try {
    session = await getSession();
  } catch (error) {
    handlePageApiError(error);
  }

  if (!hasPermission(session.permissions ?? [], 'security.mfa_policy.view')) {
    redirect('/conta?access=denied');
  }

  const canManage = hasPermission(session.permissions ?? [], 'security.mfa_policy.manage');

  let policy;
  try {
    policy = await getMfaPolicy();
  } catch (error) {
    handlePageApiError(error);
  }

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Administração"
        title="Política MFA"
        description="Enforcement por perfil, modo soft/blocking e conformidade. Env permanece override break-glass."
        stats={[
          { label: 'Modo', value: mfaModeLabel(policy.effective.mode) },
          {
            label: 'Pendentes',
            value: String(policy.compliance.total_missing_mfa),
          },
          {
            label: 'Blocking',
            value: policy.blocking_readiness.ready ? 'Pronto' : 'Guardado',
          },
        ]}
      />

      <PageSection title="Navegação">
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/usuarios" className={adminNavLinkClassName}>
            ← Usuários
          </Link>
          <Link href="/admin/notificacoes" className={adminNavLinkClassName}>
            Notificações
          </Link>
        </div>
      </PageSection>

      <MfaPolicyAdminPanel policy={policy} canManage={canManage} />
    </div>
  );
}
