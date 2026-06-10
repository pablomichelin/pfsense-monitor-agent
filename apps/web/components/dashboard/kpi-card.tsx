import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

type KpiIndicator =
  | { kind: 'status'; dotClass: string }
  | { kind: 'badge'; variant: 'neutral' | 'danger' | 'info' };

export function KpiCard({
  label,
  value,
  indicator,
}: {
  label: string;
  value: number;
  indicator: KpiIndicator;
}) {
  return (
    <Card className="min-h-28 p-6">
      <p className="font-mono text-xs uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="font-display text-3xl font-semibold text-white">
          {value}
        </span>
        {indicator.kind === 'status' ? (
          <span
            className={cn('status-dot shrink-0', indicator.dotClass)}
            aria-hidden
          />
        ) : (
          <Badge variant={indicator.variant} className="shrink-0">
            {label}
          </Badge>
        )}
      </div>
    </Card>
  );
}
