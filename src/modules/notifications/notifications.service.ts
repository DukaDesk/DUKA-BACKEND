import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { SmsAdapter } from './adapters/sms.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { PushAdapter } from './adapters/push.adapter';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private smsAdapter: SmsAdapter,
    private emailAdapter: EmailAdapter,
    private pushAdapter: PushAdapter,
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

  // ─── Click Tracking ──────────────────────────

  async clickTrack(notificationId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException('Notification not found');

    await this.prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });

    await this.prisma.deliveryResult.updateMany({
      where: { eventId: notificationId },
      data: { clickedAt: new Date() },
    });

    return { message: 'Click tracked' };
  }

  async getClickAnalytics(userId?: string, tenantId?: string) {
    const where: any = {};
    if (userId) where.userId = userId;
    if (tenantId) where.tenantId = tenantId;

    const notifications = await this.prisma.notification.findMany({ where });
    const total = notifications.length;
    const read = notifications.filter((n) => n.isRead).length;
    const unread = total - read;

    return {
      total,
      read,
      unread,
      readRate: total > 0 ? ((read / total) * 100).toFixed(1) + '%' : '0%',
    };
  }

  // ─── Dispatch Engine ─────────────────────────

  async sendPush(userId: string, title: string, body?: string, data?: any) {
    const notification = await this.prisma.notification.create({
      data: { userId, type: 'push', title, body, data: data || {} },
    });

    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId, isActive: true },
    });

    if (tokens.length === 0) {
      await this.prisma.deliveryResult.create({
        data: { eventId: notification.id, channel: 'push', provider: 'push', status: 'skipped', error: 'No device tokens' },
      });
      return notification;
    }

    const results = await this.pushAdapter.sendBulk({
      to: tokens.map((t) => t.token),
      title,
      body,
      data: { ...data, notificationId: notification.id },
    });

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    for (const result of results) {
      await this.prisma.deliveryResult.create({
        data: {
          eventId: notification.id,
          channel: 'push',
          provider: 'push',
          status: result.success ? 'sent' : 'failed',
          providerMessageId: result.providerMessageId,
          error: result.error,
        },
      });
    }

    this.logger.log(`Push: ${succeeded} sent, ${failed} failed for user ${userId}`);
    return notification;
  }

  async sendEmail(userId: string, subject: string, body: string, html?: string) {
    const notification = await this.prisma.notification.create({
      data: { userId, type: 'email', title: subject, body },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) {
      await this.prisma.deliveryResult.create({
        data: { eventId: notification.id, channel: 'email', provider: 'email', status: 'skipped', error: 'No email address' },
      });
      return notification;
    }

    const result = await this.emailAdapter.send({
      to: user.email,
      subject,
      body,
      html,
    });

    await this.prisma.deliveryResult.create({
      data: {
        eventId: notification.id,
        channel: 'email',
        provider: 'email',
        status: result.success ? 'sent' : 'failed',
        providerMessageId: result.providerMessageId,
        error: result.error,
      },
    });

    return notification;
  }

  async sendSms(phoneNumber: string, message: string, userId?: string) {
    const result = await this.smsAdapter.send(phoneNumber, message);

    if (userId) {
      const notification = await this.prisma.notification.create({
        data: { userId, type: 'sms', title: 'SMS', body: message },
      });

      await this.prisma.deliveryResult.create({
        data: {
          eventId: notification.id,
          channel: 'sms',
          provider: 'sms',
          status: result.success ? 'sent' : 'failed',
          providerMessageId: result.providerMessageId,
          error: result.error,
        },
      });

      return notification;
    }

    return { message: 'SMS sent', providerMessageId: result.providerMessageId };
  }

  async createNotification(data: { userId: string; tenantId?: string; type: string; title: string; body?: string; data?: any }) {
    return this.prisma.notification.create({ data });
  }

  async sendFromTemplate(templateId: string, userId: string, variables: Record<string, string>) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Template not found');

    const renderedBody = this.renderTemplate(template.body, variables);
    const renderedSubject = template.subject ? this.renderTemplate(template.subject, variables) : undefined;

    switch (template.channel) {
      case 'email':
        return this.sendEmail(userId, renderedSubject || '', renderedBody, `<p>${renderedBody.replace(/\n/g, '<br>')}</p>`);
      case 'sms':
        return this.sendSms(userId, renderedBody, userId);
      default:
        return this.sendPush(userId, renderedSubject || renderedBody, renderedBody);
    }
  }

  // ─── Campaigns ───────────────────────────────

  async sendCampaign(data: {
    tenantId?: string;
    templateId: string;
    channel?: string;
    userIds: string[];
    variables?: Record<string, string>;
    scheduledAt?: string;
    segment?: { field: string; operator: string; value: any };
  }) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id: data.templateId } });
    if (!template) throw new NotFoundException('Template not found');
    if (data.userIds.length === 0) throw new BadRequestException('No recipients specified');

    let recipients = data.userIds;

    if (data.segment) {
      const userWhere: any = { id: { in: data.userIds } };
      if (data.segment.field === 'emailVerified') {
        userWhere.emailVerified = data.segment.value === true;
      } else if (data.segment.field === 'status') {
        userWhere.status = data.segment.value;
      }
      const filtered = await this.prisma.user.findMany({ where: userWhere, select: { id: true } });
      recipients = filtered.map((u) => u.id);

      if (recipients.length === 0) {
        return { message: 'No recipients matched segment criteria', stats: { total: 0, succeeded: 0, failed: 0 } };
      }
    }

    const channel = data.channel || template.channel;

    const results = await Promise.allSettled(
      recipients.map((userId) => {
        switch (channel) {
          case 'email':
            return this.sendFromTemplate(data.templateId, userId, data.variables || {});
          case 'sms': {
            const user = this.prisma.user.findUnique({ where: { id: userId } });
            return user.then((u) => this.sendSms(u?.phoneNumber || userId, this.renderTemplate(template.body, data.variables || {}), userId));
          }
          default:
            return this.sendFromTemplate(data.templateId, userId, data.variables || {});
        }
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(`Campaign: ${succeeded} succeeded, ${failed} failed`);

    return {
      message: `Campaign sent to ${recipients.length} recipients via ${channel}`,
      stats: { total: recipients.length, succeeded, failed },
    };
  }

  async sendSmsCampaign(data: {
    tenantId?: string;
    message: string;
    recipients: { phoneNumber: string; userId?: string }[];
    scheduledAt?: string;
    segment?: { field: string; operator: string; value: any };
  }) {
    if (data.recipients.length === 0) throw new BadRequestException('No recipients specified');

    const results = await Promise.allSettled(
      data.recipients.map((r) => this.sendSms(r.phoneNumber, data.message, r.userId)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return {
      message: `SMS campaign sent to ${data.recipients.length} recipients`,
      stats: { total: data.recipients.length, succeeded, failed },
    };
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
