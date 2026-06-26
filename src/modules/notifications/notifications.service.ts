import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(notificationId: string) {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
    return { message: 'Notification marked as read' };
  }

  async sendPush(userId: string, title: string, body?: string, data?: any) {
    const notification = await this.prisma.notification.create({
      data: { userId, type: 'push', title, body, data: data || {} },
    });
    console.log(`[Push] ${title}: ${body}`);
    return notification;
  }
}
