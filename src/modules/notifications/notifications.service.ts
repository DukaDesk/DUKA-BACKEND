import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../../shared/events/event-bus.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  // ─── In-App Notifications ────────────────────

  async findAll(userId: string, query?: { unreadOnly?: boolean; type?: string; page?: number; limit?: number }) {
    const where: any = { userId };
    if (query?.unreadOnly) where.isRead = false;
    if (query?.type) where.type = query.type;

    const page = query?.page || 1;
    const limit = query?.limit || 50;
    const skip = (page - 1) * limit;

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit), unreadCount } };
  }

  async markRead(notificationId: string) {
    await this.prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
    return { message: 'Notification marked as read' };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { message: 'All notifications marked as read' };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  // ─── Notification Events (dispatch) ──────────

  async sendPush(userId: string, title: string, body?: string, data?: any) {
    const notification = await this.prisma.notification.create({
      data: { userId, type: 'push', title, body, data: data || {} },
    });

    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId, isActive: true },
    });

    for (const token of tokens) {
      this.logger.log(`[Push] To ${token.platform}:${token.token} — ${title}`);
    }

    await this.prisma.deliveryResult.create({
      data: { eventId: notification.id, channel: 'push', provider: 'fcm', status: tokens.length > 0 ? 'sent' : 'skipped' },
    });

    return notification;
  }

  async sendEmail(userId: string, subject: string, body: string) {
    const notification = await this.prisma.notification.create({
      data: { userId, type: 'email', title: subject, body },
    });

    this.logger.log(`[Email] To ${userId} — ${subject}`);
    return notification;
  }

  async createNotification(data: { userId: string; tenantId?: string; type: string; title: string; body?: string; data?: any }) {
    return this.prisma.notification.create({ data });
  }

  async sendFromTemplate(templateId: string, userId: string, variables: Record<string, string>) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Template not found');

    const renderedBody = this.renderTemplate(template.body, variables);
    const renderedSubject = template.subject ? this.renderTemplate(template.subject, variables) : undefined;

    if (template.channel === 'email') {
      return this.sendEmail(userId, renderedSubject || '', renderedBody);
    }
    return this.sendPush(userId, renderedSubject || renderedBody, renderedBody);
  }

  // ─── Templates ───────────────────────────────

  async createTemplate(data: any) {
    return this.prisma.notificationTemplate.create({
      data: {
        tenantId: data.tenantId || null,
        name: data.name,
        type: data.type || 'transactional',
        channel: data.channel || 'email',
        subject: data.subject || null,
        body: data.body,
        variables: data.variables || [],
        locale: data.locale || 'en',
      },
    });
  }

  async getTemplates(tenantId?: string) {
    const where: any = { isActive: true };
    if (tenantId) where.tenantId = tenantId;
    else where.tenantId = null;
    return this.prisma.notificationTemplate.findMany({ where, orderBy: { name: 'asc' } });
  }

  async updateTemplate(templateId: string, data: any) {
    const t = await this.prisma.notificationTemplate.findUnique({ where: { id: templateId } });
    if (!t) throw new NotFoundException('Template not found');
    return this.prisma.notificationTemplate.update({ where: { id: templateId }, data: { ...data, version: { increment: 1 } } });
  }

  async deleteTemplate(templateId: string) {
    await this.prisma.notificationTemplate.update({ where: { id: templateId }, data: { isActive: false } });
    return { message: 'Template deleted' };
  }

  // ─── Preferences ─────────────────────────────

  async getPreferences(userId: string, tenantId?: string) {
    const where: any = { userId };
    if (tenantId) where.tenantId = tenantId;
    return this.prisma.notificationPreference.findMany({ where });
  }

  async setPreference(userId: string, data: { channel: string; category: string; enabled: boolean; tenantId?: string; quietHours?: any }) {
    const existing = await this.prisma.notificationPreference.findFirst({
      where: { userId, tenantId: data.tenantId || null, channel: data.channel, category: data.category },
    });
    if (existing) {
      return this.prisma.notificationPreference.update({
        where: { id: existing.id },
        data: { enabled: data.enabled, quietHours: data.quietHours || undefined },
      });
    }
    return this.prisma.notificationPreference.create({
      data: { userId, tenantId: data.tenantId || null, channel: data.channel, category: data.category, enabled: data.enabled, quietHours: data.quietHours || null },
    });
  }

  // ─── Device Tokens ───────────────────────────

  async registerDevice(userId: string, data: { token: string; platform?: string; deviceId?: string }) {
    return this.prisma.deviceToken.upsert({
      where: { token: data.token },
      create: { userId, token: data.token, platform: data.platform, deviceId: data.deviceId },
      update: { userId, platform: data.platform, deviceId: data.deviceId, isActive: true, lastUsed: new Date() },
    });
  }

  async unregisterDevice(token: string) {
    await this.prisma.deviceToken.update({ where: { token }, data: { isActive: false } });
    return { message: 'Device unregistered' };
  }

  // ─── Helpers ─────────────────────────────────

  private renderTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
  }
}
