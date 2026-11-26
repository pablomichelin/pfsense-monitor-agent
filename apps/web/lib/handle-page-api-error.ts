import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';

/** Trata autorização e retoma o inventário quando o cursor perdeu validade. */
export function handlePageApiError(error: unknown, nodeList?: {
  pathname: '/nodes' | '/bootstrap';
  searchParams: Record<string, string | string[] | undefined>;
}): never {
  if (error instanceof ApiError && error.status === 401) {
    redirect('/login');
  }

  if (error instanceof ApiError && error.status === 403) {
    redirect('/conta?access=denied');
  }

  if (nodeList?.searchParams.cursor && error instanceof ApiError && error.status === 400 &&
      (error.code === 'INVALID_NODE_CURSOR' || error.message.startsWith('Cursor inválido ou incompatível com os filtros.'))) {
    const query = new URLSearchParams();
    for (const [key, values] of Object.entries(nodeList.searchParams)) {
      if (key === 'cursor' || values === undefined) continue;
      for (const value of Array.isArray(values) ? values : [values]) query.append(key, value);
    }
    redirect(`${nodeList.pathname}${query.size ? `?${query}` : ''}`);
  }

  throw error;
}
