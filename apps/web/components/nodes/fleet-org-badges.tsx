import { Badge } from '@/components/ui';
import { criticalityLabel, criticalityTone } from '@/lib/fleet-org-labels';
import type { NodeCriticality } from '@/lib/api';

export function CriticalityBadge({
  criticality,
}: {
  criticality: NodeCriticality | string;
}) {
  const tone = criticalityTone(criticality);
  const variant =
    tone === 'danger' ? 'danger' : tone === 'neutral' ? 'neutral' : 'info';

  return <Badge variant={variant}>{criticalityLabel(criticality)}</Badge>;
}

export function TagChipList({
  tags,
  max = 3,
}: {
  tags: Array<{ id: string; name: string }>;
  max?: number;
}) {
  if (tags.length === 0) {
    return <span className="text-xs text-slate-500">—</span>;
  }

  const visible = tags.slice(0, max);
  const hiddenCount = tags.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag) => (
        <Badge key={tag.id} variant="neutral" className="text-[11px]">
          {tag.name}
        </Badge>
      ))}
      {hiddenCount > 0 ? (
        <Badge variant="neutral" className="text-[11px]">
          +{hiddenCount}
        </Badge>
      ) : null}
    </div>
  );
}
