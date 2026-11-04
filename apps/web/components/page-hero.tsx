import Link from 'next/link';

type HeroStat = {
  href?: string;
  active?: boolean;
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

const toneClass: Record<NonNullable<HeroStat['tone']>, string> = {
  default: 'border-border bg-surface-soft/70 text-fg',
  success: 'border-success-border bg-success-muted text-success-fg',
  warning: 'border-warning-border bg-warning-muted text-warning-fg',
  danger: 'border-danger-border bg-danger-muted text-danger-fg',
};

export function PageHero({
  eyebrow,
  title,
  description,
  stats = [],
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  stats?: HeroStat[];
  aside?: React.ReactNode;
}) {
  return (
    <section className="border-b border-border pb-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between xl:gap-5">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-xs uppercase tracking-wider text-primary">
            {eyebrow}
          </p>
          <h2 className="font-display text-xl font-semibold text-fg">
            {title}
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-fg-muted">
            {description}
          </p>

          {stats.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className={`rounded-lg border px-3 py-1.5 ${toneClass[stat.tone ?? 'default']}`}
                >
                  {stat.href ? <Link href={stat.href} aria-current={stat.active ? 'page' : undefined} className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="text-xs">{stat.label}</span><strong className="ml-2 text-base">{stat.value}</strong>
                  </Link> : <><span className="text-xs">{stat.label}</span><strong className="ml-2 text-base">{stat.value}</strong></>}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {aside ? (
          <div className="shrink-0 xl:min-w-[14rem] xl:pt-0.5">
            {aside}
          </div>
        ) : null}
      </div>
    </section>
  );
}
