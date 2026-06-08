import type { Request } from 'express';
import type { RequestContext } from './ports';

/** Authenticated principal attached to the request by a guard. */
export interface AuthContext {
  accountId: bigint;
  sessionId?: string;
  scope?: string;
}

export type AuthedRequest = Request & { auth?: AuthContext };

/** Capture IP + user-agent for audit / anomaly detection (exactOptionalPropertyTypes-safe). */
export function buildContext(req: Request): RequestContext {
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];
  return {
    ...(ip ? { ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}
