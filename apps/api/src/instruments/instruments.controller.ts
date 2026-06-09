import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { InstrumentResolverService } from './instrument-resolver.service';
import type { InstrumentSearchRow } from './ports';

const EXCHANGE_CODES = new Set(['NSE', 'BSE', 'MCX', 'NFO', 'BFO', 'CDS']);

@Controller('v1/instruments')
@UseGuards(JwtAuthGuard)
export class InstrumentsController {
  constructor(private readonly resolver: InstrumentResolverService) {}

  /** Prefix-search instruments by trading symbol, e.g. ?q=RELI&exchange=NSE. */
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query('q') q: string,
    @Query('exchange') exchange?: string,
  ): Promise<readonly InstrumentSearchRow[]> {
    const scoped = exchange && EXCHANGE_CODES.has(exchange) ? exchange : null;
    return this.resolver.search(scoped, q ?? '');
  }
}
