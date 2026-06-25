import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';

/** Tratamento consistente de erros de API em server pages (401/403). */
export function handlePageApiError(error: unknown): never {
  if (error instanceof ApiError && error.status === 401) {
    redirect('/login');
  }

  if (error instanceof ApiError && error.status === 403) {
    redirect('/conta?access=denied');
  }

  throw error;
}
