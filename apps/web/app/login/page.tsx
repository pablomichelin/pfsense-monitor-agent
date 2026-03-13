import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
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
    <div className="mx-auto space-y-6">
      <PageHero
        eyebrow="Acesso humano"
        title="Controlador pronto para operacao"
        description="Autenticacao administrativa centralizada no backend do controlador, com sessao server-side, cookie seguro e trilha operacional no mesmo dominio do painel."
        stats={[
          { label: 'Sessao', value: 'Persistida no backend' },
          { label: 'Cookie', value: 'HttpOnly e SameSite' },
          { label: 'Autoridade', value: 'NestJS centralizado' },
        ]}
      />

      <div className="mx-auto grid min-h-[52vh] max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="glass-panel rounded-[2rem] p-6">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
          Controle de acesso
        </p>
        <h2 className="mt-3 font-display text-4xl text-white">
          Login administrativo
        </h2>
        <p className="mt-4 max-w-xl text-sm text-slate-400">
          A autenticacao humana do MVP agora e validada no backend do controlador com sessao server-side e cookie seguro.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Sessao</p>
            <p className="mt-2 text-sm text-slate-200">Persistida no backend</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Cookie</p>
            <p className="mt-2 text-sm text-slate-200">HttpOnly e SameSite</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Autoridade</p>
            <p className="mt-2 text-sm text-slate-200">NestJS centralizado</p>
          </div>
        </div>
        </section>

        <section className="glass-panel rounded-[2rem] p-6">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
          Entrar
        </p>
        <h3 className="mt-3 font-display text-2xl text-white">
          Acesso ao painel
        </h3>

        {hasError ? (
          <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">
            Credenciais invalidas ou sessao indisponivel.
          </div>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-slate-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              placeholder="admin@systemup.inf.br"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-slate-300">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              placeholder="Digite a senha administrativa"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
          >
            Entrar no painel
          </button>
        </form>
        </section>
      </div>
    </div>
  );
}
