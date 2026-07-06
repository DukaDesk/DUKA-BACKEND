import { Injectable, Logger } from '@nestjs/common';
import { IntegrationConnectorInterface, ConnectorConfig, SyncResult } from '../integration-connector.interface';

@Injectable()
export class GoogleCalendarConnector implements IntegrationConnectorInterface {
  readonly provider = 'google_calendar';
  readonly label = 'Google Calendar';
  readonly description = 'Sync bookings, appointments, and events with Google Calendar';
  readonly oauthRequired = true;
  private readonly logger = new Logger(GoogleCalendarConnector.name);

  private accessToken: string;
  private refreshToken: string;
  private baseUrl = 'https://www.googleapis.com/calendar/v3';

  async connect(config: ConnectorConfig) {
    this.accessToken = config.accessToken || '';
    this.refreshToken = config.refreshToken || '';
    const result = await this.testConnection();
    return result;
  }

  async disconnect() {
    this.accessToken = '';
    this.refreshToken = '';
  }

  async testConnection() {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/users/me/calendarList?maxResults=1`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return {
        success: res.ok,
        message: res.ok ? 'Google Calendar API is reachable' : `Google returned ${res.status}`,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return { success: false, message: err.message, latencyMs: Date.now() - start };
    }
  }

  async sync(type?: string): Promise<SyncResult> {
    this.logger.log(`Syncing Google Calendar events (${type || 'full'})`);
    return {
      success: true,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      summary: 'Google Calendar sync completed (stub)',
    };
  }

  getWebhookEvents() {
    return ['event.created', 'event.updated', 'event.cancelled'];
  }

  async listCalendars() {
    try {
      const res = await fetch(`${this.baseUrl}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      const data: any = await res.json();
      return { success: res.ok, calendars: data.items || [] };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async createEvent(calendarId: string, event: {
    summary: string; description?: string; start: string; end: string;
    timeZone?: string; attendees?: string[];
  }) {
    try {
      const res = await fetch(`${this.baseUrl}/calendars/${calendarId}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: event.summary,
          description: event.description,
          start: { dateTime: event.start, timeZone: event.timeZone || 'UTC' },
          end: { dateTime: event.end, timeZone: event.timeZone || 'UTC' },
          attendees: event.attendees?.map((email) => ({ email })),
        }),
      });
      const data: any = await res.json();
      return { success: res.ok, event: data, id: data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deleteEvent(calendarId: string, eventId: string) {
    try {
      const res = await fetch(`${this.baseUrl}/calendars/${calendarId}/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return { success: res.ok || res.status === 204 };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
