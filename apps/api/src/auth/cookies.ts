/** Refresh-token cookie handling. The cookie carries "<sessionId>.<refreshToken>". */
export const REFRESH_COOKIE = 'rm07_rt';

/** Path-scope the refresh cookie to the auth surface so it is not sent on every request. */
export const REFRESH_COOKIE_PATH = '/v1/auth';

export interface RefreshCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge: number;
}

export function refreshCookieOptions(maxAgeMs: number, isProduction: boolean): RefreshCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

export function serializeRefreshValue(sessionId: string, refreshToken: string): string {
  return `${sessionId}.${refreshToken}`;
}

export function parseRefreshValue(value: string): { sessionId: string; token: string } | null {
  const dot = value.indexOf('.');
  if (dot <= 0 || dot >= value.length - 1) {
    return null;
  }
  return { sessionId: value.slice(0, dot), token: value.slice(dot + 1) };
}

/** Minimal Cookie header parser (avoids a cookie-parser dependency). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) {
    return out;
  }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) {
      out[key] = decodeURIComponent(val);
    }
  }
  return out;
}
