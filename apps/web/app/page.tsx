import { redirect } from 'next/navigation';
import { getOptionalSession } from '@/lib/api';
import { resolveDefaultAuthenticatedPath } from '@/lib/route-policy';

export default async function HomePage() {
  const session = await getOptionalSession();

  if (!session) {
    redirect('/login');
  }

  redirect(
    resolveDefaultAuthenticatedPath(session.permissions ?? [], {
      hasGlobalClientScope: session.has_global_client_scope ?? false,
    }),
  );
}
