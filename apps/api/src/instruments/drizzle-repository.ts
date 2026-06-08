import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { schema, type Database } from '@rm07/db';
import { DATABASE } from '../db/database.module';
import {
  type BrokerInstrumentRow,
  type BrokerInstrumentsRepository,
} from './ports';

const UPSERT_CHUNK = 1000;

@Injectable()
export class DrizzleBrokerInstrumentsRepository implements BrokerInstrumentsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async resolve(broker: string, exchange: string, tradingSymbol: string): Promise<string | null> {
    const [row] = await this.database.db
      .select({ securityId: schema.brokerInstruments.securityId })
      .from(schema.brokerInstruments)
      .where(
        and(
          eq(schema.brokerInstruments.broker, broker),
          eq(schema.brokerInstruments.exchange, exchange),
          eq(schema.brokerInstruments.tradingSymbol, tradingSymbol),
          eq(schema.brokerInstruments.isActive, true),
        ),
      )
      .limit(1);
    return row?.securityId ?? null;
  }

  async upsertMany(rows: readonly BrokerInstrumentRow[]): Promise<number> {
    let written = 0;
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK);
      await this.database.db
        .insert(schema.brokerInstruments)
        .values(
          chunk.map((r) => ({
            broker: r.broker,
            exchange: r.exchange,
            tradingSymbol: r.tradingSymbol,
            securityId: r.securityId,
            symbolName: r.symbolName,
            instrumentType: r.instrumentType,
            lotSize: r.lotSize,
          })),
        )
        .onConflictDoUpdate({
          target: [
            schema.brokerInstruments.broker,
            schema.brokerInstruments.exchange,
            schema.brokerInstruments.tradingSymbol,
          ],
          set: {
            securityId: sql`excluded.security_id`,
            symbolName: sql`excluded.symbol_name`,
            instrumentType: sql`excluded.instrument_type`,
            lotSize: sql`excluded.lot_size`,
            isActive: true,
            updatedAt: new Date(),
          },
        });
      written += chunk.length;
    }
    return written;
  }
}
