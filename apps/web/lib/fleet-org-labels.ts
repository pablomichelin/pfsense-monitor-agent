export const CRITICALITY_LABELS: Record<string, string> = {
  critical: 'Crítico',
  standard: 'Padrão',
  lab: 'Lab',
};

export function criticalityLabel(value: string): string {
  return CRITICALITY_LABELS[value] ?? value;
}

export function criticalityTone(
  value: string,
): 'danger' | 'warning' | 'neutral' | 'default' {
  if (value === 'critical') {
    return 'danger';
  }
  if (value === 'lab') {
    return 'neutral';
  }
  return 'default';
}
