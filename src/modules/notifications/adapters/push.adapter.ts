import { Injectable, Logger } from '@nestjs/common';

export interface PushAdapterConfig {
  provider: 'expo' | 'fcm' | 'apns' | 'log';
  fcmServerKey?: string;
  apnsKeyId?: string;
  apnsTeamId?: string;
  apnsPrivateKey?: string;
  apnsBundleId?: string;
}

export interface PushPayload {
  to: string | string[];
  title: string;
  body?: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
  category?: string;
  priority?: 'default' | 'high' | 'normal';
}

export interface PushResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface PushDevice {
  token: string;
  platform: 'ios' | 'android' | 'web' | 'expo';
}

@Injectable()
export class PushAdapter {
  private readonly logger = new Logger(PushAdapter.name);
  private config: PushAdapterConfig;

  constructor() {
    this.config = {
      provider: (process.env.PUSH_PROVIDER as PushAdapterConfig['provider']) || 'log',
      fcmServerKey: process.env.FCM_SERVER_KEY,
      apnsKeyId: process.env.APNS_KEY_ID,
      apnsTeamId: process.env.APNS_TEAM_ID,
      apnsPrivateKey: process.env.APNS_PRIVATE_KEY,
      apnsBundleId: process.env.APNS_BUNDLE_ID,
    };
  }

  async send(payload: PushPayload): Promise<PushResult> {
    switch (this.config.provider) {
      case 'expo':
        return this.sendViaExpo(payload);
      case 'fcm':
        return this.sendViaFcm(payload);
      case 'apns':
        return this.sendViaApns(payload);
      case 'log':
      default:
        return this.sendViaLog(payload);
    }
  }

  async sendBulk(payload: PushPayload): Promise<PushResult[]> {
    const tokens = Array.isArray(payload.to) ? payload.to : [payload.to];
    return Promise.all(tokens.map((token) => this.send({ ...payload, to: token })));
  }

  private async sendViaExpo(payload: PushPayload): Promise<PushResult> {
    try {
      const messages = (Array.isArray(payload.to) ? payload.to : [payload.to]).map((token) => ({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: payload.sound || 'default',
        badge: payload.badge,
        priority: payload.priority || 'default',
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Expo Push error (${response.status}): ${err}`);
      }

      const result = await response.json() as any;
      return { success: true, providerMessageId: result.data?.[0]?.id || `expo-${Date.now()}` };
    } catch (err: any) {
      this.logger.error(`Expo Push failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private async sendViaFcm(payload: PushPayload): Promise<PushResult> {
    const serverKey = this.config.fcmServerKey;
    if (!serverKey) return this.sendViaLog(payload);

    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: Array.isArray(payload.to) ? payload.to[0] : payload.to,
          notification: { title: payload.title, body: payload.body, sound: payload.sound || 'default' },
          data: payload.data,
          priority: payload.priority === 'high' ? 'high' : 'normal',
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`FCM error (${response.status}): ${err}`);
      }

      return { success: true, providerMessageId: `fcm-${Date.now()}` };
    } catch (err: any) {
      this.logger.error(`FCM failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private async sendViaApns(_payload: PushPayload): Promise<PushResult> {
    this.logger.log(`[APNS] Push notification (stub)`);
    return { success: true, providerMessageId: `apns-${Date.now()}` };
  }

  private async sendViaLog(payload: PushPayload): Promise<PushResult> {
    this.logger.log(`[Push] To ${JSON.stringify(payload.to)} — ${payload.title}`);
    return { success: true, providerMessageId: `log-${Date.now()}` };
  }
}
