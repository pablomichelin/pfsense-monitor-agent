'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { revokeAuthSession } from './api';

const apiBaseUrl = process.env.MONITOR_API_BASE_URL?.trim();
const csrfCookieName =
  process.env.MONITOR_AUTH_CSRF_COOKIE_NAME?.trim() || 'monitor_pfsense_csrf';

const requireEnv = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
};

const parseSetCookie = (cookieValue: string) => {
  const [nameValue, ...attributes] = cookieValue.split(';').map((part) => part.trim());
  const [name, ...valueParts] = nameValue.split('=');
  const value = decodeURIComponent(valueParts.join('='));

  const options: {
    expires?: Date;
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    path?: string;
  } = {};

  for (const attribute of attributes) {
    const [rawKey, rawValue] = attribute.split('=');
    const key = rawKey.toLowerCase();

    if (key === 'httponly') {
      options.httpOnly = true;
      continue;
    }

    if (key === 'secure') {
      options.secure = true;
      continue;
    }

    if (key === 'path') {
      options.path = rawValue || '/';
      continue;
    }

    if (key === 'expires' && rawValue) {
      options.expires = new Date(rawValue);
      continue;
    }

    if (key === 'max-age' && rawValue) {
      options.maxAge = Number(rawValue);
      continue;
    }

    if (key === 'samesite' && rawValue) {
      const normalized = rawValue.toLowerCase();
      if (normalized === 'lax' || normalized === 'strict' || normalized === 'none') {
        options.sameSite = normalized;
      }
    }
  }

  return {
    name,
    value,
    options,
  };
};

const getSetCookieValues = (response: Response): string[] => {
  const withHelper = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof withHelper.getSetCookie === 'function') {
    return withHelper.getSetCookie();
  }

  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
};

async function syncCookiesFromApi(response: Response): Promise<void> {
  const cookieStore = await cookies();

  for (const rawCookie of getSetCookieValues(response)) {
    const parsed = parseSetCookie(rawCookie);
    cookieStore.set(parsed.name, parsed.value, parsed.options);
  }
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const requestHeaders = await headers();

  const response = await fetch(`${requireEnv(apiBaseUrl, 'MONITOR_API_BASE_URL')}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': requestHeaders.get('user-agent') ?? 'monitor-pfsense-web',
      ...(requestHeaders.get('x-forwarded-for')
        ? { 'X-Forwarded-For': requestHeaders.get('x-forwarded-for') as string }
        : {}),
      ...(requestHeaders.get('cf-connecting-ip')
        ? { 'CF-Connecting-IP': requestHeaders.get('cf-connecting-ip') as string }
        : {}),
    },
    body: JSON.stringify({
      email,
      password,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    redirect('/login?error=1');
  }

  await syncCookiesFromApi(response);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${encodeURIComponent(entry.value)}`)
    .join('; ');

  const csrfToken = cookieStore.get(csrfCookieName)?.value;

  const response = await fetch(`${requireEnv(apiBaseUrl, 'MONITOR_API_BASE_URL')}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(requestHeaders.get('cf-connecting-ip')
        ? { 'CF-Connecting-IP': requestHeaders.get('cf-connecting-ip') as string }
        : {}),
    },
    cache: 'no-store',
  });

  await syncCookiesFromApi(response);
  redirect('/login');
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get('session_id') ?? '').trim();

  if (!sessionId) {
    redirect('/sessions?status=error&message=Sessao%20invalida');
  }

  try {
    await revokeAuthSession(sessionId);
    revalidatePath('/sessions');
    redirect('/sessions?status=ok&message=Sessao%20revogada');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao revogar sessao';
    redirect(`/sessions?status=error&message=${encodeURIComponent(message)}`);
  }
}
