import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

export type KpiIndicator = { kind: 'status'; dotClass: string };

export function KpiCard({
  label,
  value,
  suffix,
  indicator,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  indicator: KpiIndicator;
}) {
  return (
    <Card className="p-3">
      <p className="text-xs text-fg-subtle">
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span className="font-display text-2xl font-semibold text-fg">
          {value}
          {suffix ? (
            <span className="ml-1 text-lg font-medium text-fg-muted">{suffix}</span>
          ) : null}
        </span>
        {indicator.kind === 'status' ? (
          <span
            className={cn('status-dot shrink-0', indicator.dotClass)}
            aria-hidden
          />
        ) : null}
      </div>
    </Card>
  );
}
