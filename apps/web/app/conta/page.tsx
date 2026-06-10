import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { PageSection } from '@/components/ui/page-section';
import { ApiError, getSession } from '@/lib/api';
import { roleLabel } from '@/lib/rbac-labels';

export const dynamic = 'force-dynamic';

export default async function ContaPage() {
  let session;

  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }

  const profileLabel = roleLabel(session.user.role);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Conta"
        title="Minha conta"
        description="Dados do seu perfil de acesso ao painel. Para alterar a senha, solicite ao administrador do sistema."
        stats={[
          { label: 'Perfil', value: profileLabel },
          { label: 'Permissões', value: String(session.permissions.length) },
        ]}
      />

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
