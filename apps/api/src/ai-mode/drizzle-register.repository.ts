import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@rm07/db';
import { DATABASE } from '../db/database.module';
import type { RecommendationsRegisterRepository, RegisterEntry } from './ports';

@Injectable()
export class DrizzleRecommendationsRegisterRepository implements RecommendationsRegisterRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async record(entry: RegisterEntry): Promise<void> {
    await this.database.db.insert(schema.recommendationsRegister).values({
      exchange: entry.exchange,
      tradingSymbol: entry.tradingSymbol,
      verdict: entry.verdict,
      oneLiner: entry.oneLiner,
      stTargetPaise: entry.stTargetPaise,
      mtTargetPaise: entry.mtTargetPaise,
      ltTargetPaise: entry.ltTargetPaise,
      stopLossPaise: entry.stopLossPaise,
      confidence: entry.confidence,
      signalNews: entry.signalNews,
      signalFundamentals: entry.signalFundamentals,
      signalTechnicals: entry.signalTechnicals,
      riskGrade: entry.riskGrade,
      rationale: entry.rationale,
      model: entry.model,
      promptVersion: entry.promptVersion,
      raRegistrationNumber: entry.raRegistrationNumber,
      signedBy: entry.signedBy,
    });
  }
}
