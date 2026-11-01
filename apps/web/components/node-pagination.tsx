import type { NodesListResponse } from '@/lib/api';

export function NodePagination({ result, basePath, params = {} }: {
  result: Pick<NodesListResponse, 'total' | 'items' | 'next_cursor' | 'previous_cursor'>;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (cursor?: string) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value && key !== 'cursor') query.set(key, value);
    if (cursor) query.set('cursor', cursor);
    return `${basePath}${query.size ? `?${query}` : ''}`;
  };
  return <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted" aria-label="Paginação de firewalls">
    <span>{result.items.length} exibidos de {result.total} firewalls</span>
    <div className="flex gap-3">
      <a href={href()} className="text-primary">Início</a>
      {result.previous_cursor ? <a href={href(result.previous_cursor)} className="text-primary">Anterior</a> : null}
      {result.next_cursor ? <a href={href(result.next_cursor)} className="text-primary">Próxima</a> : null}
    </div>
  </nav>;
}
