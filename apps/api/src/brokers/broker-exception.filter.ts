import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BrokerError, type BrokerErrorCode } from './errors';

const STATUS: Record<BrokerErrorCode, number> = {
  no_account_key: HttpStatus.CONFLICT,
  transit_decrypt_failed: HttpStatus.BAD_REQUEST,
  no_adapter: HttpStatus.NOT_IMPLEMENTED,
  broker_verify_failed: HttpStatus.BAD_GATEWAY,
  connection_not_found: HttpStatus.NOT_FOUND,
  instrument_not_found: HttpStatus.NOT_FOUND,
  forbidden: HttpStatus.FORBIDDEN,
};

/** Renders BrokerError as RFC 9457 Problem Details with a stable machine-readable code. */
@Catch(BrokerError)
export class BrokerExceptionFilter implements ExceptionFilter {
  catch(exception: BrokerError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const status = STATUS[exception.code] ?? HttpStatus.BAD_REQUEST;
    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: 'Broker connection error',
        status,
        code: exception.code,
        instance: req.url,
      });
  }
}
