import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { AuthContext, AuthedRequest } from './request-context';

/** Inject the authenticated principal set by a guard. Throws if no guard ran. */
export const CurrentAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) {
      throw new UnauthorizedException({ title: 'Unauthorized', code: 'auth.required' });
    }
    return req.auth;
  },
);
