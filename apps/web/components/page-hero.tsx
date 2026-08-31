type HeroStat = {
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
    <section className="glass-panel overflow-hidden rounded-xl p-3 sm:p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between xl:gap-5">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-mono text-xs uppercase tracking-wider text-primary">
            {eyebrow}
          </p>
          <h2 className="font-display text-2xl font-semibold text-fg">
            {title}
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">
            {description}
          </p>

          {stats.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {stats.map((stat) => (
                <div
                  key={`${stat.label}-${stat.value}`}
                  className={`rounded-lg border px-3 py-2 ${toneClass[stat.tone ?? 'default']}`}
                >
                  <p className="font-mono text-[11px] uppercase tracking-wider opacity-90">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 text-sm font-medium">
                    {stat.value}
                  </p>
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
