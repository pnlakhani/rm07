import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EmailSender, OtpPurpose } from '../auth/ports';

export const RESEND_CONFIG = Symbol('RESEND_CONFIG');

export interface ResendConfig {
  apiKey: string | undefined;
  from: string;
}

const SUBJECTS: Record<OtpPurpose, string> = {
  signup_verification: 'Your RM07 verification code',
  password_reset: 'Your RM07 password reset code',
};

/**
 * Transactional email via Resend (fetch-based; no SDK dependency). When no API key is configured
 * (local dev), the code is logged instead of sent so the flow is still exercisable. The OTP code
 * is the only PII in the body and is never logged in production paths.
 */
@Injectable()
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);

  constructor(@Inject(RESEND_CONFIG) private readonly config: ResendConfig) {}

  async sendOtp(input: { email: string; code: string; purpose: OtpPurpose }): Promise<void> {
    const subject = SUBJECTS[input.purpose];
    const text = `Your code is ${input.code}. It expires in 5 minutes. If you did not request this, ignore this email.`;

    if (!this.config.apiKey) {
      this.logger.warn(`[dev email] to=${input.email} subject="${subject}" code=${input.code}`);
      return;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: this.config.from, to: [input.email], subject, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend send failed: ${res.status} ${detail.slice(0, 200)}`);
    }
  }
}
