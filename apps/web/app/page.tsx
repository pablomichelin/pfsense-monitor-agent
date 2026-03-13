import { redirect } from 'next/navigation';
import { getOptionalSession } from '@/lib/api';

export default async function HomePage() {
  const session = await getOptionalSession();

  redirect(session ? '/dashboard' : '/login');
}
