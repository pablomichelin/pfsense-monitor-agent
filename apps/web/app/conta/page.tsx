import Link from 'next/link';
import { PageHero } from '@/components/page-hero';
import { PageSection } from '@/components/ui/page-section';
import { Alert } from '@/components/ui';
import { getSession } from '@/lib/api';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { roleLabel } from '@/lib/rbac-labels';
import { MfaSection } from './mfa-section';

export const dynamic = 'force-dynamic';

export default async function ContaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const accessDenied = params.access === 'denied';
  const mfaRequired = params.mfa === 'required';

  let session;

  try {
    session = await getSession();
  } catch (error) {
    handlePageApiError(error);
  }

  const profileLabel = roleLabel(session.user.role);

  return (
    <div className="space-y-section">
      <PageHero
        eyebrow="Conta"
        title="Minha conta"
        description="Dados do seu perfil de acesso ao painel. Para alterar a senha, solicite ao administrador do sistema."
        stats={[
          { label: 'Perfil', value: profileLabel },
          { label: 'Permissões', value: String(session.permissions.length) },
        ]}
      />

      {accessDenied ? (
        <Alert variant="warning">
          Você não tem permissão para acessar a página solicitada. Se acredita que isso é um erro,
          contate o administrador do controlador.
        </Alert>
      ) : null}

      {mfaRequired ? (
        <Alert variant="warning">
          A verificação em duas etapas (MFA) é obrigatória para o seu perfil. Configure o MFA abaixo
          antes de continuar usando o painel.
        </Alert>
      ) : null}

      <PageSection title="Identificação">
        <div className="glass-panel rounded-xl p-5 sm:p-6">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <dt className="text-sm font-medium text-slate-400">E-mail</dt>
              <dd className="truncate font-mono text-slate-100">{session.user.email}</dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt className="text-sm font-medium text-slate-400">Perfil</dt>
              <dd className="text-slate-100">{profileLabel}</dd>
            </div>
            <div className="min-w-0 space-y-1 sm:col-span-2">
              <dt className="text-sm font-medium text-slate-400">Identificador da sessão atual</dt>
              <dd className="truncate font-mono text-xs text-slate-400">{session.session.id}</dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection
        title="Verificação em duas etapas (MFA)"
        description="Proteja seu acesso com um aplicativo autenticador TOTP e códigos de recuperação."
      >
        <MfaSection />
      </PageSection>

      <PageSection
        title="Senha"
        description="A troca de senha não está disponível nesta tela. O administrador pode redefinir credenciais em Usuários."
      >
        <div className="glass-panel rounded-xl p-5 sm:p-6">
          <p className="text-sm leading-relaxed text-slate-400">
            Para encerrar outros dispositivos conectados com sua conta, use{' '}
            <Link href="/sessions" className="text-cyan-300 transition hover:text-cyan-200">
              Sessões
            </Link>
            . Para sair deste navegador, use o botão <span className="text-slate-300">Sair</span> no
            cabeçalho.
          </p>
        </div>
      </PageSection>
    </div>
  );
}
