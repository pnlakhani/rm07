import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Renders every error as an RFC 9457 Problem Details document (TRD §6.2).
 * Internal errors are never leaked to the client; they are logged with the trace id.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const traceId = (req.headers['traceparent'] as string | undefined) ?? undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        title = response;
      } else if (response && typeof response === 'object') {
        const body = response as Record<string, unknown>;
        title = (body['title'] as string) ?? (body['error'] as string) ?? exception.message;
        detail = (body['detail'] as string) ?? (body['message'] as string | undefined);
        code = body['code'] as string | undefined;
      }
    } else {
      this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title,
        status,
        ...(detail ? { detail } : {}),
        ...(code ? { code } : {}),
        ...(traceId ? { traceId } : {}),
        instance: req.url,
      });
  }
}
