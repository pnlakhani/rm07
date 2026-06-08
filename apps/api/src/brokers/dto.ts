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
