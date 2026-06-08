import { Inject, Injectable } from '@nestjs/common';
import { BROKER_INSTRUMENTS_REPOSITORY, type BrokerInstrumentsRepository } from './ports';

/** Resolves a broker-side security id from (broker, exchange, tradingSymbol). */
@Injectable()
export class InstrumentResolverService {
  constructor(
    @Inject(BROKER_INSTRUMENTS_REPOSITORY) private readonly repo: BrokerInstrumentsRepository,
  ) {}

  resolveSecurityId(broker: string, exchange: string, tradingSymbol: string): Promise<string | null> {
    return this.repo.resolve(broker, exchange, tradingSymbol);
  }
}
