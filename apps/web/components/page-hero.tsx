type HeroStat = {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

const toneClass: Record<NonNullable<HeroStat['tone']>, string> = {
  default: 'border-slate-700/80 bg-panel-soft/70 text-slate-200',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  danger: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
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
    <section className="glass-panel overflow-hidden rounded-xl p-5 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between xl:gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-400/90">
            {eyebrow}
          </p>
          <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">
            {title}
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
            {description}
          </p>

          {stats.length > 0 ? (
            <div className="pt-3 flex flex-wrap gap-3">
              {stats.map((stat) => (
                <div
                  key={`${stat.label}-${stat.value}`}
                  className={`rounded-lg border px-4 py-2.5 ${toneClass[stat.tone ?? 'default']}`}
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
