import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class DeveloperService {
  private readonly logger = new Logger(DeveloperService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Developer Apps ──────────────────────────────────────────

  async createApp(data: {
    tenantId: string; name: string; description?: string;
    website?: string; callbackUrls?: string[]; scopes?: string[];
    createdBy?: string; logoUrl?: string;
  }) {
    const clientId = `duka_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = crypto.randomBytes(32).toString('hex');

    return this.prisma.developerApp.create({
      data: {
        ...data,
        clientId,
        clientSecret,
        callbackUrls: data.callbackUrls || [],
        scopes: data.scopes || ['*'],
      } as any,
    });
  }

  async getApps(tenantId: string) {
    return this.prisma.developerApp.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getApp(id: string) {
    const app = await this.prisma.developerApp.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Developer app not found');
    return app;
  }

  async updateApp(id: string, data: Partial<{
    name: string; description: string; website: string;
    callbackUrls: string[]; scopes: string[]; isActive: boolean; logoUrl: string;
  }>) {
    return this.prisma.developerApp.update({ where: { id }, data: data as any });
  }

  async regenerateSecret(id: string) {
    const clientSecret = crypto.randomBytes(32).toString('hex');
    return this.prisma.developerApp.update({
      where: { id },
      data: { clientSecret },
    });
  }

  async deleteApp(id: string) {
    return this.prisma.developerApp.delete({ where: { id } });
  }

  // ─── Webhook Endpoints ───────────────────────────────────────

  async createWebhook(data: {
    tenantId: string; appId?: string; name: string; url: string;
    events: string[]; secret?: string; retryCount?: number;
    timeoutMs?: number; headers?: Record<string, string>;
  }) {
    return this.prisma.webhookEndpoint.create({ data: data as any });
  }

  async getWebhooks(tenantId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async getWebhook(id: string) {
    const webhook = await this.prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!webhook) throw new NotFoundException('Webhook endpoint not found');
    return webhook;
  }

  async updateWebhook(id: string, data: Partial<{
    name: string; url: string; events: string[]; secret: string;
    isActive: boolean; retryCount: number; timeoutMs: number; headers: Record<string, string>;
  }>) {
    return this.prisma.webhookEndpoint.update({ where: { id }, data: data as any });
  }

  async deleteWebhook(id: string) {
    return this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  async triggerWebhookById(id: string, event: string, payload: any) {
    const endpoint = await this.getWebhook(id);
    if (!endpoint.isActive) throw new NotFoundException('Webhook endpoint is not active');

    return this.deliverWebhook(endpoint, event, payload);
  }

  async triggerWebhook(tenantId: string, event: string, payload: any) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId, events: { has: event }, isActive: true },
    });

    const results: Array<{ endpointId: string; status: string; statusCode?: number; durationMs?: number; error?: string }> = [];
    for (const endpoint of endpoints) {
      results.push(await this.deliverWebhook(endpoint, event, payload));
    }

    return { event, triggered: endpoints.length, results };
  }

  private async deliverWebhook(endpoint: any, event: string, payload: any) {
    const logEntry = await this.prisma.webhookEventLog.create({
      data: {
        endpointId: endpoint.id,
        tenantId: endpoint.tenantId,
        event,
        payload: payload as any,
        status: 'pending',
      } as any,
    });

    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs);

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': endpoint.secret || '',
          'X-Webhook-Event': event,
          ...(endpoint.headers as Record<string, string> || {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      const responseBody = await response.text();
      const status = response.ok ? 'delivered' : 'failed';

      await this.prisma.webhookEventLog.update({
        where: { id: logEntry.id },
        data: { status, statusCode: response.status, responseBody, durationMs },
      });

      await this.prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { lastStatus: status, lastTriggeredAt: new Date() },
      });

      return { endpointId: endpoint.id, status, statusCode: response.status, durationMs };
    } catch (err: any) {
      await this.prisma.webhookEventLog.update({
        where: { id: logEntry.id },
        data: { status: 'failed', error: err.message },
      });

      await this.prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { lastStatus: 'failed', lastTriggeredAt: new Date() },
      });

      return { endpointId: endpoint.id, status: 'failed', error: err.message };
    }
  }

  async getWebhookLogs(endpointId?: string, tenantId?: string, page = 1, limit = 50) {
    const where: any = {};
    if (endpointId) where.endpointId = endpointId;
    if (tenantId) where.tenantId = tenantId;

    const [data, total] = await Promise.all([
      this.prisma.webhookEventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.webhookEventLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getWebhookRetries(endpointId: string) {
    const failed = await this.prisma.webhookEventLog.findMany({
      where: { endpointId, status: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return failed;
  }

  // ─── Developer Resources ─────────────────────────────────────

  async getApiResources() {
    const endpoints = [
      { version: 'v1', basePath: '/api/v1' },
    ];
    return {
      apiVersion: '1.0.0',
      baseUrl: '/api/v1',
      authentication: 'Bearer JWT or X-API-Key',
      documentationUrl: '/docs',
      endpoints,
    };
  }

  async getRateLimitStatus(tenantId: string) {
    const quota = await this.prisma.apiQuota.findUnique({ where: { tenantId } });
    if (!quota) return { allowed: true, remaining: { min: 60, hour: 1000, day: 10000 } };

    return {
      allowed: true,
      limits: {
        perMinute: quota.requestsPerMin,
        perHour: quota.requestsPerHour,
        perDay: quota.requestsPerDay,
      },
      current: {
        min: quota.currentMin,
        hour: quota.currentHour,
        day: quota.currentDay,
      },
      resetsAt: {
        min: quota.resetMinAt,
        hour: quota.resetHourAt,
        day: quota.resetDayAt,
      },
    };
  }
}
