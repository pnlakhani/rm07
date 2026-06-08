import { z } from 'zod';
import { brokerSchema } from '@rm07/core';

/** ECIES transit payload produced by the browser (base64 fields). */
export const eciesPayloadSchema = z
  .object({
    epk: z.string().min(1),
    salt: z.string().min(1),
    iv: z.string().min(1),
    tag: z.string().min(1),
    ct: z.string().min(1),
  })
  .strict();

export const connectBrokerSchema = z
  .object({
    broker: brokerSchema,
    payload: eciesPayloadSchema,
  })
  .strict();
export type ConnectBrokerDto = z.infer<typeof connectBrokerSchema>;

/** Exchange codes accepted on order entry (mirror of @rm07/broker-adapters ExchangeCode). */
const exchangeCode = z.enum(['NSE', 'BSE', 'MCX', 'NFO', 'BFO', 'CDS']);
/** Money on the wire is an integer paise string — never a float (TRD money rule). */
const paiseString = z.string().regex(/^\d+$/u, 'must be an integer paise amount');

/**
 * Order-entry payload. Prices are integer-paise strings; quantity is a positive integer count.
 * LIMIT/SL require a limit price, SL/SLM require a trigger price, and MARKET must carry no price.
 * `idempotencyKey` is mandatory (Hard rule #2 — a POST order is never replayed without a key).
 */
export const placeOrderSchema = z
  .object({
    tradingSymbol: z.string().trim().min(1).max(64),
    exchange: exchangeCode,
    side: z.enum(['BUY', 'SELL']),
    quantity: z.number().int().positive(),
    orderType: z.enum(['MARKET', 'LIMIT', 'SL', 'SLM']),
    product: z.enum(['CNC', 'MIS', 'NRML', 'CO', 'BO', 'AMO']),
    validity: z.enum(['DAY', 'IOC']).default('DAY'),
    pricePaise: paiseString.optional(),
    triggerPricePaise: paiseString.optional(),
    idempotencyKey: z.string().trim().min(8).max(64),
  })
  .strict()
  .superRefine((v, ctx) => {
    const needsPrice = v.orderType === 'LIMIT' || v.orderType === 'SL';
    const needsTrigger = v.orderType === 'SL' || v.orderType === 'SLM';
    if (needsPrice && !v.pricePaise) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pricePaise'],
        message: `pricePaise is required for ${v.orderType} orders`,
      });
    }
    if (needsTrigger && !v.triggerPricePaise) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['triggerPricePaise'],
        message: `triggerPricePaise is required for ${v.orderType} orders`,
      });
    }
    if (v.orderType === 'MARKET' && v.pricePaise) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pricePaise'],
        message: 'MARKET orders must not include a price',
      });
    }
  });
export type PlaceOrderDto = z.infer<typeof placeOrderSchema>;
