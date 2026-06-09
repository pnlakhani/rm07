import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { RequiresPlan, RequiresPlanGuard } from '../billing/requires-plan.guard';
import { AiVerdictService } from './ai-verdict.service';
import type { AiModeVerdictView } from './types';

const EXCHANGE_CODES = new Set(['NSE', 'BSE', 'MCX', 'NFO', 'BFO', 'CDS']);

/** AI Mode (Full Doc §III.7.1). Basic+ only — Free shows an upgrade CTA, enforced by RequiresPlanGuard. */
@Controller('v1/ai')
@UseGuards(JwtAuthGuard, RequiresPlanGuard)
export class AiModeController {
  constructor(private readonly verdicts: AiVerdictService) {}

  @Get('verdict')
  @RequiresPlan('basic')
  @HttpCode(HttpStatus.OK)
  async verdict(
    @Query('symbol') symbol: string,
    @Query('exchange') exchange: string,
  ): Promise<AiModeVerdictView> {
    if (!symbol || !EXCHANGE_CODES.has(exchange)) {
      throw new BadRequestException({
        title: 'symbol and a valid exchange are required',
        code: 'request.invalid',
      });
    }
    return this.verdicts.getVerdict(exchange, symbol.toUpperCase());
  }
}
