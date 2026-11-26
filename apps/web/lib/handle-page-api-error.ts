import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';

/** Trata autorização e retoma listagens cujo cursor perdeu validade. */
export function handlePageApiError(error: unknown, list?: {
  pathname: '/nodes' | '/bootstrap' | '/admin/usuarios';
  searchParams: Record<string, string | string[] | undefined>;
}): never {
  if (error instanceof ApiError && error.status === 401) {
    redirect('/login');
  }

  if (error instanceof ApiError && error.status === 403) {
    redirect('/conta?access=denied');
  }

  if (list?.searchParams.cursor && error instanceof ApiError && error.status === 400) {
    const invalidCursor = list.pathname === '/admin/usuarios'
      ? error.message === 'invalid user cursor' || error.message === 'cursor must be a UUID'
      : error.code === 'INVALID_NODE_CURSOR' || error.message.startsWith('Cursor inválido ou incompatível com os filtros.');
    if (invalidCursor) {
      const query = new URLSearchParams();
      for (const [key, values] of Object.entries(list.searchParams)) {
        if (key === 'cursor' || values === undefined) continue;
        for (const value of Array.isArray(values) ? values : [values]) query.append(key, value);
      }
      redirect(`${list.pathname}${query.size ? `?${query}` : ''}`);
    }
  }

  throw error;
}
