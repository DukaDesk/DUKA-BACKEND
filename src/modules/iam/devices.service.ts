import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  async register(userId: string, data: { platform?: string; appVersion?: string; pushToken?: string; deviceName?: string }) {
    return this.prisma.device.create({
      data: {
        userId,
        platform: data.platform,
        appVersion: data.appVersion,
        pushToken: data.pushToken,
        deviceName: data.deviceName,
        trustStatus: 'untrusted',
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastActive: 'desc' },
    });
  }

  async update(deviceId: string, userId: string, data: { deviceName?: string; pushToken?: string; trustStatus?: string }) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) throw new NotFoundException('Device not found');

    return this.prisma.device.update({
      where: { id: deviceId },
      data: { ...data, lastActive: new Date() },
    });
  }

  async revoke(deviceId: string, userId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.device.delete({ where: { id: deviceId } });
    return { message: 'Device revoked' };
  }

  async updatePushToken(deviceId: string, pushToken: string) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { pushToken, lastActive: new Date() },
    });
  }
}
