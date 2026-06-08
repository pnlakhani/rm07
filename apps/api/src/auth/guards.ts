import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TOTP_ENROL_SCOPE } from './auth.service';
import { InvalidTokenError, JwtService } from './jwt.service';
import type { AuthedRequest } from './request-context';

function extractBearer(req: AuthedRequest): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function unauthorized(detail: string): never {
  throw new UnauthorizedException({ title: 'Unauthorized', code: 'auth.invalid_token', detail });
}

/** Requires a valid access token; attaches { accountId, sessionId } to the request. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractBearer(req);
    if (!token) {
      unauthorized('Missing bearer token');
    }
    try {
      const claims = this.jwt.verify(token);
      req.auth = { accountId: BigInt(claims.sub), sessionId: claims.sid };
      return true;
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        unauthorized(err.message);
      }
      throw err;
    }
  }
}

/** Requires a valid TOTP-enrolment grant; attaches { accountId, scope }. */
@Injectable()
export class EnrolmentGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractBearer(req);
    if (!token) {
      unauthorized('Missing enrolment grant');
    }
    try {
      const grant = this.jwt.verifyGrant(token, TOTP_ENROL_SCOPE);
      req.auth = { accountId: BigInt(grant.sub), scope: grant.scope };
      return true;
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        unauthorized(err.message);
      }
      throw err;
    }
  }
}
