import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { evaluateRouteAccess, resolveDefaultAuthenticatedPath } from '@/lib/route-policy';
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

type FetchSessionResult =
  | { kind: 'ok'; session: AuthMeResponse }
  | { kind: 'unauthenticated' }
  | { kind: 'network_error' };

function resolveApiBaseUrl(): string {
  const configured = process.env.MONITOR_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  return 'http://127.0.0.1:8088';
}

function hasSessionCookie(request: NextRequest): boolean {
  const cookieHeader = request.headers.get('cookie');
  return Boolean(cookieHeader?.includes(`${SESSION_COOKIE}=`));
}

async function fetchSession(request: NextRequest): Promise<FetchSessionResult> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader?.includes(`${SESSION_COOKIE}=`)) {
    return { kind: 'unauthenticated' };
  }

  try {
    const response = await fetch(`${resolveApiBaseUrl()}/api/v1/auth/me`, {
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });

    if (response.status === 401) {
      return { kind: 'unauthenticated' };
    }

    if (!response.ok) {
      return { kind: 'network_error' };
    }

    return { kind: 'ok', session: (await response.json()) as AuthMeResponse };
  } catch {
    return { kind: 'network_error' };
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
    const result = await fetchSession(request);
    if (result.kind === 'ok' && result.session?.authenticated) {
      const nextPath =
        sanitizeInternalPath(request.nextUrl.searchParams.get('next')) ??
        resolveDefaultAuthenticatedPath(
          result.session.permissions ?? [],
          { hasGlobalClientScope: result.session.has_global_client_scope ?? false },
        );
      return NextResponse.redirect(new URL(nextPath, request.url));
    }
    return NextResponse.next();
  }

  const result = await fetchSession(request);

  if (result.kind === 'network_error') {
    if (hasSessionCookie(request)) {
      return NextResponse.next();
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (result.kind !== 'ok' || !result.session?.authenticated || !result.session.user?.role) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = result.session;
  const userRole = session.user!.role as string;

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
    role: userRole,
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
