import Link from 'next/link';

export default function FirewallNotFound() {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <h1 className="font-display text-2xl font-semibold text-fg">Firewall indisponível</h1>
      <p className="text-sm text-fg-muted">Volte ao inventário para localizar o equipamento.</p>
      <Link href="/nodes" className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm text-primary hover:bg-surface-soft">
        Voltar ao inventário
      </Link>
    </section>
  );
}
