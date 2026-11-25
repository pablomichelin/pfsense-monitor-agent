export const sessionCookieName =
  process.env.MONITOR_AUTH_SESSION_COOKIE_NAME?.trim() || 'monitor_pfsense_session';

export const csrfCookieName =
  process.env.MONITOR_AUTH_CSRF_COOKIE_NAME?.trim() || 'monitor_pfsense_csrf';
