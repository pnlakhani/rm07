import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { loadEnv } from '../config/env';
import { AuthService } from './auth.service';
import { AuthExceptionFilter } from './auth-exception.filter';
import { CurrentAccount } from './current-account.decorator';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  parseCookies,
  parseRefreshValue,
  refreshCookieOptions,
  serializeRefreshValue,
} from './cookies';
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  signinSchema,
  signupSchema,
  totpConfirmSchema,
  verifyOtpSchema,
  type PasswordResetConfirmDto,
  type PasswordResetRequestDto,
  type SigninDto,
  type SignupDto,
  type TotpConfirmDto,
  type VerifyOtpDto,
} from './dto';
import { EnrolmentGuard, JwtAuthGuard } from './guards';
import { buildContext, type AuthContext } from './request-context';
import { REFRESH_TTL_SECONDS } from './refresh-token.service';
import type { IssuedSession } from './auth.service';

@Controller('v1/auth')
@UseFilters(AuthExceptionFilter)
export class AuthController {
  private readonly isProduction = loadEnv().NODE_ENV === 'production';

  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.ACCEPTED)
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) body: SignupDto,
    @Req() req: Request,
  ): Promise<{ status: 'otp_sent' }> {
    await this.auth.signup(
      { email: body.email, password: body.password, ...(body.signupSource ? { signupSource: body.signupSource } : {}) },
      buildContext(req),
    );
    return { status: 'otp_sent' };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) body: VerifyOtpDto,
  ): Promise<{ enrolmentToken: string }> {
    return this.auth.verifySignupOtp(body.email, body.code);
  }

  @Post('totp/enrol')
  @UseGuards(EnrolmentGuard)
  @HttpCode(HttpStatus.OK)
  async enrolTotp(@CurrentAccount() account: AuthContext): Promise<{ secret: string; keyUri: string }> {
    return this.auth.enrolTotp(account.accountId);
  }

  @Post('totp/confirm')
  @UseGuards(EnrolmentGuard)
  @HttpCode(HttpStatus.OK)
  async confirmTotp(
    @Body(new ZodValidationPipe(totpConfirmSchema)) body: TotpConfirmDto,
    @CurrentAccount() account: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const session = await this.auth.confirmTotp(account.accountId, body.code, buildContext(req));
    return this.completeSession(res, session);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(
    @Body(new ZodValidationPipe(signinSchema)) body: SigninDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const session = await this.auth.signin(body, buildContext(req));
    return this.completeSession(res, session);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const cookie = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
    const parsed = cookie ? parseRefreshValue(cookie) : null;
    if (!parsed) {
      throw new UnauthorizedException({ title: 'Unauthorized', code: 'auth.no_refresh' });
    }
    const session = await this.auth.refresh(parsed.sessionId, parsed.token, buildContext(req));
    return this.completeSession(res, session);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentAccount() account: AuthContext, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logoutAll(account.accountId);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body(new ZodValidationPipe(passwordResetRequestSchema)) body: PasswordResetRequestDto,
    @Req() req: Request,
  ): Promise<{ status: 'ok' }> {
    await this.auth.requestPasswordReset(body.email, buildContext(req));
    return { status: 'ok' };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(passwordResetConfirmSchema)) body: PasswordResetConfirmDto,
  ): Promise<void> {
    await this.auth.confirmPasswordReset(body);
  }

  /** Set the httpOnly refresh cookie and return the access token. */
  private completeSession(res: Response, session: IssuedSession): { accessToken: string } {
    res.cookie(
      REFRESH_COOKIE,
      serializeRefreshValue(session.sessionId, session.refreshToken),
      refreshCookieOptions(REFRESH_TTL_SECONDS * 1000, this.isProduction),
    );
    return { accessToken: session.accessToken };
  }
}
