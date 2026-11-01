import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
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

export type SortableNode = {
  id: string;
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

/** Total order: UUID is the final, direction-independent tie breaker. */
export function compareListNodes(
  left: SortableNode, right: SortableNode,
  sortBy: ListNodesSortBy, sortOrder: ListNodesSortOrder,
): number {
  return compareField(left, right, sortBy) * (sortOrder === 'desc' ? -1 : 1)
    || compareNullableText(left.client.name, right.client.name)
    || compareNullableText(displayNameOf(left), displayNameOf(right))
    || left.id.localeCompare(right.id);
}

export function sortListNodesItems<T extends SortableNode>(
  items: T[], sortBy: ListNodesSortBy, sortOrder: ListNodesSortOrder,
): T[] {
  return [...items].sort((a, b) => compareListNodes(a, b, sortBy, sortOrder));
}

type NodeCursor = { v: 1; filter: string; at: string; direction: 'after' | 'before'; anchor: SortableNode };

export function nodeListFingerprint(filters: unknown): string {
  return createHash('sha256').update(JSON.stringify(filters)).digest('hex');
}

// Only sort keys are carried; never serialize the full node or any credential.
export function encodeNodeCursor(anchor: SortableNode, direction: NodeCursor['direction'], filter: string, at: string): string {
  const { id, hostname, display_name, effective_status, pfsense_version, agent_version,
    open_alerts, backup_status, last_seen_at, client } = anchor;
  return Buffer.from(JSON.stringify({ v: 1, filter, at, direction, anchor: {
    id, hostname, display_name, effective_status, pfsense_version, agent_version,
    open_alerts, backup_status, last_seen_at, client: { name: client.name },
  } })).toString('base64url');
}

export function decodeNodeCursor(value: string | undefined, filter: string): NodeCursor | null {
  if (!value) return null;
  try {
    if (value.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const a = c.anchor;
    if (c.v !== 1 || c.filter !== filter || !['after', 'before'].includes(c.direction)
      || typeof c.at !== 'string' || !Number.isFinite(Date.parse(c.at))
      || Date.parse(c.at) > Date.now() + 60_000 || !a
      || !['id', 'hostname', 'effective_status', 'backup_status'].every((k) => typeof a[k] === 'string')
      || !['display_name', 'pfsense_version', 'agent_version', 'last_seen_at'].every((k) => a[k] === null || typeof a[k] === 'string')
      || typeof a.client?.name !== 'string' || !Number.isSafeInteger(a.open_alerts) || a.open_alerts < 0) throw new Error();
    return c as NodeCursor;
  } catch {
    throw new BadRequestException('Cursor inválido ou incompatível com os filtros. Reinicie a listagem.');
  }
}

/** Streaming top/bottom page: retains at most limit rows, regardless of fleet size. */
export class NodePageCollector<T extends SortableNode> {
  readonly items: T[] = [];
  total = 0;
  eligible = 0;
  constructor(private readonly limit: number, private readonly compare: (a: T, b: SortableNode) => number,
    private readonly cursor: NodeCursor | null) {}

  add(item: T): void {
    this.total++;
    if (this.cursor) {
      const delta = this.compare(item, this.cursor.anchor);
      if (this.cursor.direction === 'after' ? delta <= 0 : delta >= 0) return;
    }
    this.eligible++;
    let low = 0, high = this.items.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.compare(this.items[middle], item) < 0) low = middle + 1;
      else high = middle;
    }
    this.items.splice(low, 0, item);
    if (this.items.length > this.limit) {
      if (this.cursor?.direction === 'before') this.items.shift();
      else this.items.pop();
    }
  }

  get hasPrevious(): boolean {
    return this.cursor?.direction === 'before' ? this.eligible > this.limit : this.total > this.eligible;
  }
  get hasNext(): boolean {
    return this.cursor?.direction === 'before' ? this.total > this.eligible : this.eligible > this.limit;
  }
}
