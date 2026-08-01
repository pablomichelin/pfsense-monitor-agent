export const INVENTORY_SORT_FIELDS = [
  'status',
  'name',
  'version',
  'agent_version',
  'backup',
  'alerts',
  'last_seen',
] as const;

export type InventorySortBy = (typeof INVENTORY_SORT_FIELDS)[number];
export type InventorySortOrder = 'asc' | 'desc';

export function isInventorySortBy(value: string | undefined): value is InventorySortBy {
  return (
    typeof value === 'string' &&
    (INVENTORY_SORT_FIELDS as readonly string[]).includes(value)
  );
}

export function buildNodesInventoryHref(input: {
  params: Record<string, string | undefined>;
  sortBy: InventorySortBy;
  sortOrder: InventorySortOrder;
}): string {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(input.params)) {
    if (!value || key === 'sort_by' || key === 'sort_order') {
      continue;
    }
    next.set(key, value);
  }

  next.set('sort_by', input.sortBy);
  next.set('sort_order', input.sortOrder);

  const query = next.toString();
  return query ? `/nodes?${query}` : '/nodes';
}

export function nextInventorySortOrder(input: {
  column: InventorySortBy;
  currentSortBy: InventorySortBy;
  currentSortOrder: InventorySortOrder;
}): InventorySortOrder {
  if (input.column !== input.currentSortBy) {
    return 'asc';
  }
  return input.currentSortOrder === 'asc' ? 'desc' : 'asc';
}
