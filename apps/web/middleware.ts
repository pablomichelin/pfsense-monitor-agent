import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { evaluateRouteAccess } from '@/lib/route-policy';
import { sanitizeInternalPath } from '@/lib/internal-path';

const SESSION_COOKIE = 'monitor_pfsense_session';
const PUBLIC_PATHS = new Set(['/login']);

type AuthMeResponse = {
  authenticated?: boolean;
  user?: {
    role?: string;
  };
  permissions?: string[];
};

function resolveApiBaseUrl(): string {
  const configured = process.env.MONITOR_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  return 'http://127.0.0.1:8088';
}

async function fetchSession(request: NextRequest): Promise<AuthMeResponse | null> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader?.includes(`${SESSION_COOKIE}=`)) {
    return null;
  }

  try {
    const response = await fetch(`${resolveApiBaseUrl()}/api/v1/auth/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AuthMeResponse;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    const session = await fetchSession(request);
    if (session?.authenticated) {
      const nextPath =
        sanitizeInternalPath(request.nextUrl.searchParams.get('next')) ??
        '/dashboard';
      return NextResponse.redirect(new URL(nextPath, request.url));
    }
    return NextResponse.next();
  }

  const session = await fetchSession(request);
  if (!session?.authenticated || !session.user?.role) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const access = evaluateRouteAccess(pathname, {
    role: session.user.role,
    permissions: session.permissions ?? [],
  });

  if (!access.allowed) {
    return NextResponse.redirect(new URL(access.redirectTo ?? '/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
