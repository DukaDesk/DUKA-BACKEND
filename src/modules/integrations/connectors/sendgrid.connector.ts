import { Injectable, Logger } from '@nestjs/common';
import { IntegrationConnectorInterface, ConnectorConfig, SyncResult } from '../integration-connector.interface';

@Injectable()
export class SendGridConnector implements IntegrationConnectorInterface {
  readonly provider = 'sendgrid';
  readonly label = 'SendGrid';
  readonly description = 'Email marketing platform for campaigns, contacts, and transactional emails';
  readonly oauthRequired = false;
  private readonly logger = new Logger(SendGridConnector.name);

  private apiKey: string;

  async connect(config: ConnectorConfig) {
    this.apiKey = config.apiKey || '';
    const result = await this.testConnection();
    return result;
  }

  async disconnect() {
    this.apiKey = '';
  }

  async testConnection() {
    const start = Date.now();
    try {
      const res = await fetch('https://api.sendgrid.com/v3/scopes', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return {
        success: res.ok,
        message: res.ok ? 'SendGrid API is reachable' : `SendGrid returned ${res.status}`,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return { success: false, message: err.message, latencyMs: Date.now() - start };
    }
  }

  async sync(type?: string): Promise<SyncResult> {
    this.logger.log(`Syncing SendGrid contacts (${type || 'full'})`);
    return {
      success: true,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      summary: 'SendGrid sync completed (stub)',
    };
  }

  getWebhookEvents() {
    return ['contact.created', 'contact.updated', 'campaign.sent', 'email.delivered', 'email.opened', 'email.clicked'];
  }

  async addContact(email: string, name?: string, listIds?: string[]) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/marketing/contacts', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contacts: [{ email, first_name: name?.split(' ')[0], last_name: name?.split(' ').slice(1).join(' ') }],
          list_ids: listIds,
        }),
      });
      return { success: res.ok, status: res.status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async sendCampaign(templateId: string, subject: string, recipients: string[], from: string) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: recipients.map((email) => ({ to: [{ email }] })),
          from: { email: from },
          template_id: templateId,
          subject,
        }),
      });
      return { success: res.ok, status: res.status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
