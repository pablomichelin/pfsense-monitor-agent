import { coerce, compare as semverCompare } from 'semver';

export const LIST_NODES_SORT_FIELDS = [
  'name',
  'agent_version',
  'version',
  'status',
  'backup',
  'alerts',
  'last_seen',
] as const;

export type ListNodesSortBy = (typeof LIST_NODES_SORT_FIELDS)[number];
export type ListNodesSortOrder = 'asc' | 'desc';

const STATUS_RANK: Record<string, number> = {
  offline: 0,
  degraded: 1,
  unknown: 2,
  maintenance: 3,
  online: 4,
};

const BACKUP_RANK: Record<string, number> = {
  failed: 0,
  never: 1,
  late: 2,
  ok: 3,
};

type SortableNode = {
  hostname: string;
  display_name: string | null;
  effective_status: string;
  pfsense_version: string | null;
  agent_version: string | null;
  open_alerts: number;
  backup_status: string;
  last_seen_at: string | null;
  client: { name: string };
};

function displayNameOf(node: SortableNode): string {
  return (node.display_name ?? node.hostname).trim();
}

function compareNullableText(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const a = left?.trim() ?? '';
  const b = right?.trim() ?? '';
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return 1;
  }
  if (!b) {
    return -1;
  }
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
}

function compareVersionLike(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const a = left?.trim() ?? '';
  const b = right?.trim() ?? '';
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return 1;
  }
  if (!b) {
    return -1;
  }

  const coercedA = coerce(a.replace(/-RELEASE$/i, '').trim());
  const coercedB = coerce(b.replace(/-RELEASE$/i, '').trim());
  if (coercedA && coercedB) {
    return semverCompare(coercedA, coercedB);
  }

  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
}

function compareField(
  left: SortableNode,
  right: SortableNode,
  sortBy: ListNodesSortBy,
): number {
  switch (sortBy) {
    case 'status':
      return (
        (STATUS_RANK[left.effective_status] ?? 99) -
        (STATUS_RANK[right.effective_status] ?? 99)
      );
    case 'name':
      return compareNullableText(displayNameOf(left), displayNameOf(right));
    case 'version':
      return compareVersionLike(left.pfsense_version, right.pfsense_version);
    case 'agent_version':
      return compareVersionLike(left.agent_version, right.agent_version);
    case 'backup':
      return (
        (BACKUP_RANK[left.backup_status] ?? 99) -
        (BACKUP_RANK[right.backup_status] ?? 99)
      );
    case 'alerts':
      return left.open_alerts - right.open_alerts;
    case 'last_seen': {
      const a = left.last_seen_at ?? '';
      const b = right.last_seen_at ?? '';
      if (!a && !b) {
        return 0;
      }
      if (!a) {
        return 1;
      }
      if (!b) {
        return -1;
      }
      return a.localeCompare(b);
    }
    default:
      return 0;
  }
}

export function sortListNodesItems<T extends SortableNode>(
  items: T[],
  sortBy: ListNodesSortBy,
  sortOrder: ListNodesSortOrder,
): T[] {
  const direction = sortOrder === 'desc' ? -1 : 1;

  return [...items].sort((left, right) => {
    const primary = compareField(left, right, sortBy);
    if (primary !== 0) {
      return primary * direction;
    }

    const byClient = compareNullableText(left.client.name, right.client.name);
    if (byClient !== 0) {
      return byClient;
    }

    return compareNullableText(displayNameOf(left), displayNameOf(right));
  });
}
