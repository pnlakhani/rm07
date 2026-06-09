import { z } from 'zod';

export const createWatchlistSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();
export type CreateWatchlistDto = z.infer<typeof createWatchlistSchema>;

export const addItemSchema = z
  .object({
    exchange: z.enum(['NSE', 'BSE', 'MCX', 'NFO', 'BFO', 'CDS']),
    tradingSymbol: z.string().trim().min(1).max(64),
  })
  .strict();
export type AddItemDto = z.infer<typeof addItemSchema>;
