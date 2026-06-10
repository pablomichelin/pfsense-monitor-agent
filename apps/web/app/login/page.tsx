import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { Alert, Button, Card } from '@/components/ui';
import { getOptionalSession } from '@/lib/api';
import { loginAction } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getOptionalSession();
  if (session) {
    redirect('/dashboard');
  }

  const params = (await searchParams) ?? {};
  const hasError = params.error === '1';

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
