import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthError, type AuthErrorCode } from './auth.service';

const STATUS: Record<AuthErrorCode, number> = {
  email_taken: HttpStatus.CONFLICT,
  invalid_credentials: HttpStatus.UNAUTHORIZED,
  account_not_active: HttpStatus.FORBIDDEN,
  otp_invalid: HttpStatus.BAD_REQUEST,
  otp_expired: HttpStatus.GONE,
  otp_locked: HttpStatus.TOO_MANY_REQUESTS,
  totp_required: HttpStatus.FORBIDDEN,
  totp_invalid: HttpStatus.UNAUTHORIZED,
  mfa_not_enrolled: HttpStatus.BAD_REQUEST,
  session_invalid: HttpStatus.UNAUTHORIZED,
};

/** Renders AuthError as RFC 9457 Problem Details with a stable machine-readable code. */
@Catch(AuthError)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: AuthError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const status = STATUS[exception.code] ?? HttpStatus.BAD_REQUEST;
    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: 'Authentication error',
        status,
        code: exception.code,
        instance: req.url,
      });
  }
}
