import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { Alert, Button, Card } from '@/components/ui';
import { getOptionalSession } from '@/lib/api';
import { loginAction, loginMfaAction } from '@/lib/auth';
import { sanitizeInternalPath } from '@/lib/internal-path';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getOptionalSession();
  const params = (await searchParams) ?? {};
  const nextPath = sanitizeInternalPath(
    typeof params.next === 'string' ? params.next : undefined,
  );

  if (session) {
    redirect(nextPath ?? '/dashboard');
  }

  const hasError = params.error === '1';
  const mfaStep = params.mfa === '1';

  if (mfaStep) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <PageHero
          eyebrow="Acesso humano"
          title="Verificação em duas etapas"
          description="Informe o código do seu aplicativo autenticador ou um código de recuperação."
        />

        <Card className="p-6">
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-400/90">
            MFA
          </p>
          <h3 className="mt-2 font-display text-xl font-semibold text-white">
            Código de verificação
          </h3>

          {hasError ? (
            <Alert variant="error" className="mt-5">
              Código inválido ou desafio expirado. Tente novamente.
            </Alert>
          ) : null}

          <form action={loginMfaAction} className="mt-6 space-y-5">
            {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-slate-300">
                Código (TOTP) ou recuperação
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                required
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm tracking-widest text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="000000"
              />
            </div>
            <Button type="submit" className="w-full">
              Verificar e entrar
            </Button>
          </form>
          <p className="mt-4 text-xs text-slate-500">
            <a href="/login" className="text-cyan-300 hover:text-cyan-200">
              Voltar
            </a>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHero
        eyebrow="Acesso humano"
        title="Entrar no painel"
        description="Autenticacao administrativa do controlador."
      />

      <Card className="p-6">
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-400/90">
            Entrar
          </p>
          <h3 className="mt-2 font-display text-xl font-semibold text-white">
            Acesso ao painel
          </h3>

          {hasError ? (
            <Alert variant="error" className="mt-5">
              Credenciais inválidas ou sessão indisponível.
            </Alert>
          ) : null}

          <form action={loginAction} className="mt-6 space-y-5">
            {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="admin@systemup.inf.br"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                placeholder="Digite a senha administrativa"
              />
            </div>
            <Button type="submit" className="w-full">
              Entrar no painel
            </Button>
          </form>
      </Card>
    </div>
  );
}
