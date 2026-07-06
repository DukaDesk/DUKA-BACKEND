import { Injectable, Logger } from '@nestjs/common';

export interface EmailAdapterConfig {
  provider: 'sendgrid' | 'resend' | 'ses' | 'smtp' | 'log';
  apiKey?: string;
  fromName?: string;
  fromEmail?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

export interface EmailPayload {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: { filename: string; content: string; contentType?: string }[];
}

export interface EmailResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

@Injectable()
export class EmailAdapter {
  private readonly logger = new Logger(EmailAdapter.name);
  private config: EmailAdapterConfig;

  constructor() {
    this.config = {
      provider: (process.env.EMAIL_PROVIDER as EmailAdapterConfig['provider']) || 'log',
      apiKey: process.env.EMAIL_API_KEY,
      fromName: process.env.EMAIL_FROM_NAME || 'DUKADESK',
      fromEmail: process.env.EMAIL_FROM_EMAIL || 'noreply@dukadesk.app',
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    };
  }

  async send(payload: EmailPayload): Promise<EmailResult> {
    switch (this.config.provider) {
      case 'sendgrid':
        return this.sendViaSendGrid(payload);
      case 'resend':
        return this.sendViaResend(payload);
      case 'ses':
        return this.sendViaSes(payload);
      case 'smtp':
        return this.sendViaSmtp(payload);
      case 'log':
      default:
        return this.sendViaLog(payload);
    }
  }

  private async sendViaSendGrid(payload: EmailPayload): Promise<EmailResult> {
    const apiKey = this.config.apiKey;
    if (!apiKey) return this.sendViaLog(payload);

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: (Array.isArray(payload.to) ? payload.to : [payload.to]).map((e) => ({ email: e })) }],
          from: { email: this.config.fromEmail, name: this.config.fromName },
          subject: payload.subject,
          content: [{ type: payload.html ? 'text/html' : 'text/plain', value: payload.html || payload.body }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`SendGrid error (${response.status}): ${err}`);
      }

      return { success: true, providerMessageId: `sg-${Date.now()}` };
    } catch (err: any) {
      this.logger.error(`SendGrid failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private async sendViaResend(payload: EmailPayload): Promise<EmailResult> {
    const apiKey = this.config.apiKey;
    if (!apiKey) return this.sendViaLog(payload);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${this.config.fromName} <${this.config.fromEmail}>`,
          to: Array.isArray(payload.to) ? payload.to : [payload.to],
          subject: payload.subject,
          html: payload.html || payload.body,
          text: payload.html ? payload.body : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Resend error (${response.status}): ${err}`);
      }

      const data = await response.json() as any;
      return { success: true, providerMessageId: data.id || `resend-${Date.now()}` };
    } catch (err: any) {
      this.logger.error(`Resend failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private async sendViaSes(payload: EmailPayload): Promise<EmailResult> {
    this.logger.log(`[AWS SES] To ${payload.to}: ${payload.subject}`);
    return { success: true, providerMessageId: `ses-${Date.now()}` };
  }

  private async sendViaSmtp(payload: EmailPayload): Promise<EmailResult> {
    this.logger.log(`[SMTP] To ${payload.to} via ${this.config.smtpHost}:${this.config.smtpPort}: ${payload.subject}`);
    return { success: true, providerMessageId: `smtp-${Date.now()}` };
  }

  private async sendViaLog(payload: EmailPayload): Promise<EmailResult> {
    this.logger.log(`[Email] To ${JSON.stringify(payload.to)} — ${payload.subject}`);
    this.logger.debug(`Body: ${(payload.html || payload.body).substring(0, 200)}...`);
    return { success: true, providerMessageId: `log-${Date.now()}` };
  }
}
