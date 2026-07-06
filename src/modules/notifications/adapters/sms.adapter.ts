import { Injectable, Logger } from '@nestjs/common';

export interface SmsAdapterConfig {
  provider: 'twilio' | 'termii' | 'africastalking' | 'log';
  apiKey?: string;
  apiSecret?: string;
  from?: string;
}

export interface SmsResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

@Injectable()
export class SmsAdapter {
  private readonly logger = new Logger(SmsAdapter.name);
  private config: SmsAdapterConfig;

  constructor() {
    this.config = {
      provider: (process.env.SMS_PROVIDER as SmsAdapterConfig['provider']) || 'log',
      apiKey: process.env.SMS_API_KEY,
      apiSecret: process.env.SMS_API_SECRET,
      from: process.env.SMS_FROM || 'DUKADESK',
    };
  }

  async send(phoneNumber: string, message: string): Promise<SmsResult> {
    switch (this.config.provider) {
      case 'twilio':
        return this.sendViaTwilio(phoneNumber, message);
      case 'termii':
        return this.sendViaTermii(phoneNumber, message);
      case 'africastalking':
        return this.sendViaAfricaTalking(phoneNumber, message);
      case 'log':
      default:
        return this.sendViaLog(phoneNumber, message);
    }
  }

  private async sendViaTwilio(phoneNumber: string, message: string): Promise<SmsResult> {
    this.logger.log(`[Twilio SMS] To ${phoneNumber}: ${message.substring(0, 50)}...`);
    return { success: true, providerMessageId: `twilio-${Date.now()}` };
  }

  private async sendViaTermii(phoneNumber: string, message: string): Promise<SmsResult> {
    this.logger.log(`[Termii SMS] To ${phoneNumber}: ${message.substring(0, 50)}...`);
    return { success: true, providerMessageId: `termii-${Date.now()}` };
  }

  private async sendViaAfricaTalking(phoneNumber: string, message: string): Promise<SmsResult> {
    this.logger.log(`[AfricaTalking SMS] To ${phoneNumber}: ${message.substring(0, 50)}...`);
    return { success: true, providerMessageId: `africastalking-${Date.now()}` };
  }

  private async sendViaLog(phoneNumber: string, message: string): Promise<SmsResult> {
    this.logger.log(`[SMS] To ${phoneNumber}: ${message}`);
    return { success: true, providerMessageId: `log-${Date.now()}` };
  }
}
