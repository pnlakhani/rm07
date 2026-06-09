import { bigint, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { core } from './namespaces.js';

/**
 * Immutable recommendations register (Backend Schema §5.16). Every AI Mode verdict shown to a user
 * is appended here with full provenance. Non-personal (identical for all users) → no RLS; the
 * migration (0008) blocks UPDATE/DELETE so the audit trail is tamper-evident.
 */
export const recommendationsRegister = core.table('recommendations_register', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  exchange: text('exchange').notNull(),
  tradingSymbol: text('trading_symbol').notNull(),
  /** BUY | ADD | HOLD | TRIM | EXIT | INSUFFICIENT_EVIDENCE */
  verdict: text('verdict').notNull(),
  oneLiner: text('one_liner').notNull(),
  stTargetPaise: bigint('st_target_paise', { mode: 'bigint' }),
  mtTargetPaise: bigint('mt_target_paise', { mode: 'bigint' }),
  ltTargetPaise: bigint('lt_target_paise', { mode: 'bigint' }),
  stopLossPaise: bigint('stop_loss_paise', { mode: 'bigint' }),
  confidence: integer('confidence').notNull(),
  /** bull | bear | neutral | na */
  signalNews: text('signal_news').notNull(),
  signalFundamentals: text('signal_fundamentals').notNull(),
  signalTechnicals: text('signal_technicals').notNull(),
  /** low | medium | high | aggressive */
  riskGrade: text('risk_grade').notNull(),
  rationale: text('rationale').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  raRegistrationNumber: text('ra_registration_number').notNull(),
  signedBy: text('signed_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
