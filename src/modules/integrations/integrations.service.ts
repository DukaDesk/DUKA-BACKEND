import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { IntegrationConnectorInterface, ConnectorConfig } from './integration-connector.interface';
import { SendGridConnector } from './connectors/sendgrid.connector';
import { GoogleCalendarConnector } from './connectors/google-calendar.connector';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private connectorRegistry = new Map<string, IntegrationConnectorInterface>();

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    sendGridConnector: SendGridConnector,
    googleCalendarConnector: GoogleCalendarConnector,
  ) {
    this.registerConnector(sendGridConnector);
    this.registerConnector(googleCalendarConnector);
  }

  registerConnector(connector: IntegrationConnectorInterface): void {
    this.connectorRegistry.set(connector.provider, connector);
    this.logger.log(`Registered integration connector: ${connector.provider}`);
  }

  getConnectorProvider(provider: string): IntegrationConnectorInterface | undefined {
    return this.connectorRegistry.get(provider);
  }

  getAvailableConnectors(): { provider: string; label: string; description: string; oauthRequired: boolean }[] {
    return Array.from(this.connectorRegistry.values()).map((c) => ({
      provider: c.provider,
      label: c.label,
      description: c.description,
      oauthRequired: c.oauthRequired,
    }));
  }

  async connect(tenantId: string, provider: string, config: ConnectorConfig) {
    const connector = this.connectorRegistry.get(provider);
    if (!connector) throw new BadRequestException(`Unknown connector: ${provider}`);

    const result = await connector.connect(config);

    const stored = await this.prisma.integrationConnector.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: {
        tenantId,
        name: connector.label,
        provider,
        config: config as any,
        credentials: config.apiKey || config.apiSecret
          ? { apiKey: config.apiKey ? `enc_${config.apiKey.substring(0, 8)}...` : null } as any
          : Prisma.DbNull,
        status: result.success ? 'connected' : 'error',
      },
      update: {
        config: config as any,
        status: result.success ? 'connected' : 'error',
      },
    });

    return { connector: stored, testResult: result };
  }

  async disconnect(tenantId: string, provider: string) {
    const stored = await this.prisma.integrationConnector.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!stored) throw new NotFoundException('Connector not found');

    const connector = this.connectorRegistry.get(provider);
    if (connector) await connector.disconnect();

    await this.prisma.integrationConnector.update({
      where: { id: stored.id },
      data: { status: 'disconnected', enabled: false },
    });

    return { message: `Disconnected ${provider}` };
  }

  async getConnectors(tenantId: string) {
    return this.prisma.integrationConnector.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async getConnector(tenantId: string, provider: string) {
    const stored = await this.prisma.integrationConnector.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!stored) throw new NotFoundException('Connector not found');
    return stored;
  }

  async testConnection(tenantId: string, provider: string) {
    const stored = await this.prisma.integrationConnector.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!stored) throw new NotFoundException('Connector not found');

    const connector = this.connectorRegistry.get(provider);
    if (!connector) throw new BadRequestException(`Unknown connector: ${provider}`);

    const result = await connector.testConnection();

    await this.prisma.integrationConnector.update({
      where: { id: stored.id },
      data: { status: result.success ? 'connected' : 'error' },
    });

    return result;
  }

  async sync(tenantId: string, provider: string, type?: string) {
    const stored = await this.prisma.integrationConnector.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!stored) throw new NotFoundException('Connector not found');
    if (!stored.enabled) throw new BadRequestException('Connector is disabled');

    const connector = this.connectorRegistry.get(provider);
    if (!connector) throw new BadRequestException(`Unknown connector: ${provider}`);

    const job = await this.prisma.syncJob.create({
      data: {
        connectorId: stored.id,
        type: type || 'full',
        status: 'running',
        startedAt: new Date(),
      },
    });

    try {
      const result = await connector.sync(type);

      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: result.success ? 'completed' : 'failed',
          completedAt: new Date(),
          result: result as any,
        },
      });

      await this.prisma.integrationConnector.update({
        where: { id: stored.id },
        data: { lastSyncAt: new Date() },
      });

      return result;
    } catch (err: any) {
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: { status: 'failed', completedAt: new Date(), error: err.message },
      });
      throw err;
    }
  }

  async getSyncHistory(tenantId: string, provider: string) {
    const stored = await this.prisma.integrationConnector.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!stored) throw new NotFoundException('Connector not found');

    return this.prisma.syncJob.findMany({
      where: { connectorId: stored.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async queueWebhook(tenantId: string, eventType: string, payload: any, url: string, headers?: Record<string, string>) {
    return this.prisma.webhookOutbox.create({
      data: {
        tenantId,
        eventType,
        payload: payload as any,
        url,
        headers: headers as any || undefined,
        status: 'pending',
        nextRetryAt: new Date(),
      },
    });
  }

  async processPendingWebhooks(batchSize = 10) {
    const pending = await this.prisma.webhookOutbox.findMany({
      where: {
        status: 'pending',
        OR: [
          { nextRetryAt: null },
          { nextRetryAt: { lte: new Date() } },
        ],
        attempts: { lt: 3 },
      },
      take: batchSize,
    });

    let processed = 0;
    for (const webhook of pending) {
      try {
        const response = await fetch(webhook.url, {
          method: webhook.method,
          headers: {
            'Content-Type': 'application/json',
            ...(webhook.headers as Record<string, string> || {}),
          },
          body: JSON.stringify(webhook.payload),
        });

        if (response.ok) {
          await this.prisma.webhookOutbox.update({
            where: { id: webhook.id },
            data: { status: 'delivered', completedAt: new Date(), attempts: { increment: 1 } },
          });
        } else {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
      } catch (err: any) {
        const attempts = webhook.attempts + 1;
        const maxedOut = attempts >= webhook.maxAttempts;

        await this.prisma.webhookOutbox.update({
          where: { id: webhook.id },
          data: {
            status: maxedOut ? 'failed' : 'pending',
            attempts,
            lastError: err.message,
            nextRetryAt: maxedOut ? undefined : new Date(Date.now() + Math.pow(2, attempts) * 60000),
          },
        });
      }
      processed++;
    }

    return { processed, remaining: pending.length - processed };
  }
}
