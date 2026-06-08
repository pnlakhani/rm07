import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../security/password.service';

/**
 * Auth request DTOs. All schemas are `.strict()` so unknown fields are rejected at the boundary
 * (TRD §6.2, Full Doc VII.5). Deep password strength (HIBP) is enforced by PasswordService;
 * these schemas enforce structure only.
 */
const email = z.string().trim().toLowerCase().email();
const sixDigits = z.string().regex(/^\d{6}$/u, 'must be a 6-digit code');
const password = z.string().min(MIN_PASSWORD_LENGTH, `min ${MIN_PASSWORD_LENGTH} characters`);

export const signupSchema = z
  .object({
    email,
    password,
    signupSource: z.string().max(120).optional(),
  })
  .strict();
export type SignupDto = z.infer<typeof signupSchema>;

export const verifyOtpSchema = z.object({ email, code: sixDigits }).strict();
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

export const totpConfirmSchema = z.object({ code: sixDigits }).strict();
export type TotpConfirmDto = z.infer<typeof totpConfirmSchema>;

export const signinSchema = z
  .object({
    email,
    password: z.string().min(1),
    totp: sixDigits,
  })
  .strict();
export type SigninDto = z.infer<typeof signinSchema>;

export const passwordResetRequestSchema = z.object({ email }).strict();
export type PasswordResetRequestDto = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z
  .object({
    email,
    code: sixDigits,
    totp: sixDigits,
    newPassword: password,
  })
  .strict();
export type PasswordResetConfirmDto = z.infer<typeof passwordResetConfirmSchema>;
