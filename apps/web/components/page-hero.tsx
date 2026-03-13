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
    <section className="glass-panel overflow-hidden rounded-[2rem] px-6 py-6 sm:px-7">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-cyan-300">
            {eyebrow}
          </p>
          <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            {description}
          </p>

          {stats.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {stats.map((stat) => (
                <div
                  key={`${stat.label}-${stat.value}`}
                  className={`rounded-2xl border px-4 py-3 ${toneClass[stat.tone ?? 'default']}`}
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] opacity-70">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {aside ? <div className="xl:min-w-[16rem]">{aside}</div> : null}
      </div>
    </section>
  );
}
