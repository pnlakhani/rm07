import { z } from 'zod';

/**
 * RFC 9457 Problem Details for HTTP APIs. Every API error response uses this shape
 * (TRD §6.2, Full Doc §III.5.2).
 */
export const problemDetailsSchema = z.object({
  type: z.string().url().default('about:blank'),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  /** Machine-readable application error code, e.g. "broker.token_expired". */
  code: z.string().optional(),
  /** W3C trace id for correlation. */
  traceId: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export function problem(
  status: number,
  title: string,
  options: Partial<Omit<ProblemDetails, 'status' | 'title'>> = {},
): ProblemDetails {
  return problemDetailsSchema.parse({ status, title, type: 'about:blank', ...options });
}
