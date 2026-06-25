import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { evaluateRouteAccess } from '@/lib/route-policy';
import { sanitizeInternalPath } from '@/lib/internal-path';

const SESSION_COOKIE = 'monitor_pfsense_session';
const PUBLIC_PATHS = new Set(['/login']);

const MFA_ALLOWED_PREFIXES = ['/conta', '/sessions', '/login'];

type AuthMeResponse = {
  authenticated?: boolean;
  user?: {
    role?: string;
  };
  permissions?: string[];
  has_global_client_scope?: boolean;
  mfa_enrollment_required?: boolean;
  mfa_enforcement_blocking?: boolean;
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

function isMfaAllowedPath(pathname: string): boolean {
  return MFA_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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

  if (
    session.mfa_enforcement_blocking &&
    session.mfa_enrollment_required &&
    !isMfaAllowedPath(pathname)
  ) {
    const contaUrl = new URL('/conta', request.url);
    contaUrl.searchParams.set('mfa', 'required');
    return NextResponse.redirect(contaUrl);
  }

  const access = evaluateRouteAccess(pathname, {
    role: session.user.role,
    permissions: session.permissions ?? [],
    hasGlobalClientScope: session.has_global_client_scope ?? false,
    mfaEnrollmentRequired: session.mfa_enrollment_required,
    mfaEnforcementBlocking: session.mfa_enforcement_blocking,
  });

  if (!access.allowed) {
    return NextResponse.redirect(new URL(access.redirectTo ?? '/conta?access=denied', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
