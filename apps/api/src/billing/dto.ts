import { z } from 'zod';

/** Start a subscription for one of our plans (mapped to a Razorpay plan id server-side). */
export const subscribeSchema = z.object({ planId: z.string().trim().min(1).max(40) }).strict();
export type SubscribeDto = z.infer<typeof subscribeSchema>;
