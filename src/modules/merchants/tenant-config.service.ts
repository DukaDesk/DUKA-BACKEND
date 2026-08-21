import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class TenantConfigService {
  constructor(private prisma: PrismaService) {}

  async getConfig(tenantId: string) {
    const config = await this.prisma.tenantConfig.findUnique({
      where: { tenantId },
    });
    if (!config) {
      return {
        tenantId,
        languages: ['en'],
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        region: 'NG',
        offlinePolicy: 'cache-first',
      };
    }
    return config;
  }

  async updateConfig(tenantId: string, data: any) {
    return this.prisma.tenantConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }

  async getFeatures(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!subscription || subscription.status !== 'active') {
      return {
        commerce: false,
        booking: false,
        forms: true,
        notifications: true,
        analytics: false,
        integrations: false,
        custom_domain: false,
        plan: 'none',
      };
    }

    const features = (subscription.plan.features as Record<string, boolean>) || {};
    return { ...features, plan: subscription.plan.slug };
  }
}
