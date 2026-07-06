import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class PlatformAdminService {
  constructor(private prisma: PrismaService) {}

  // ─── Platform Settings ───────────────────────────────────────

  async getSetting(key: string) {
    const setting = await this.prisma.platformSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting ${key} not found`);
    return setting;
  }

  async setSetting(key: string, data: {
    value: any; type?: string; category?: string; description?: string; isEncrypted?: boolean;
  }) {
    return this.prisma.platformSetting.upsert({
      where: { key },
      create: { key, ...data },
      update: { ...data },
    });
  }

  async getAllSettings(category?: string) {
    const where: any = {};
    if (category) where.category = category;
    return this.prisma.platformSetting.findMany({ where, orderBy: { key: 'asc' } });
  }

  async deleteSetting(key: string) {
    return this.prisma.platformSetting.delete({ where: { key } });
  }

  // ─── System Announcements ────────────────────────────────────

  async createAnnouncement(data: {
    title: string; body: string; type?: string; priority?: string;
    audiences?: string[]; startsAt?: string; expiresAt?: string; createdBy?: string;
  }) {
    return this.prisma.systemAnnouncement.create({
      data: {
        ...data,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      } as any,
    });
  }

  async getActiveAnnouncements(type?: string) {
    const now = new Date();

    const allActive = await this.prisma.systemAnnouncement.findMany({
      where: { isActive: true },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return allActive.filter((a) => {
      if (type && a.type !== type) return false;
      if (a.startsAt && a.startsAt > now) return false;
      if (a.expiresAt && a.expiresAt < now) return false;
      return true;
    });
  }

  async getAllAnnouncements(page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.systemAnnouncement.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.systemAnnouncement.count(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateAnnouncement(id: string, data: any) {
    return this.prisma.systemAnnouncement.update({ where: { id }, data });
  }

  async deleteAnnouncement(id: string) {
    return this.prisma.systemAnnouncement.delete({ where: { id } });
  }

  // ─── Feature Flags ───────────────────────────────────────────

  async createFeatureFlag(data: {
    key: string; name: string; description?: string;
    enabled?: boolean; rules?: Record<string, any>; tenants?: string[];
  }) {
    return this.prisma.featureFlag.create({ data: data as any });
  }

  async getAllFeatureFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async getFeatureFlag(key: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new NotFoundException(`Feature flag ${key} not found`);
    return flag;
  }

  async isEnabled(key: string, tenantId?: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag || !flag.enabled) return false;
    if (tenantId && flag.tenants.length > 0) {
      return flag.tenants.includes(tenantId);
    }
    return true;
  }

  async updateFeatureFlag(key: string, data: Partial<{
    name: string; description: string; enabled: boolean;
    rules: Record<string, any>; tenants: string[];
  }>) {
    return this.prisma.featureFlag.update({ where: { key }, data: data as any });
  }

  async deleteFeatureFlag(key: string) {
    return this.prisma.featureFlag.delete({ where: { key } });
  }

  // ─── Plan Management ─────────────────────────────────────────

  async createPlan(data: {
    name: string; slug: string; price: number; currency?: string;
    features?: Record<string, any>; limits?: Record<string, any>; isActive?: boolean;
  }) {
    return this.prisma.plan.create({ data: data as any });
  }

  async getAllPlans() {
    return this.prisma.plan.findMany({ orderBy: { price: 'asc' } });
  }

  async getPlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async updatePlan(id: string, data: Partial<{
    name: string; price: number; currency: string;
    features: Record<string, any>; limits: Record<string, any>; isActive: boolean;
  }>) {
    return this.prisma.plan.update({ where: { id }, data: data as any });
  }

  async deletePlan(id: string) {
    return this.prisma.plan.delete({ where: { id } });
  }

  // ─── API Quotas ──────────────────────────────────────────────

  async getApiQuota(tenantId: string) {
    let quota = await this.prisma.apiQuota.findUnique({ where: { tenantId } });
    if (!quota) {
      quota = await this.prisma.apiQuota.create({
        data: { tenantId } as any,
      });
    }
    return quota;
  }

  async updateApiQuota(tenantId: string, data: Partial<{
    requestsPerMin: number; requestsPerHour: number; requestsPerDay: number;
    burstLimit: number; concurrentLimit: number;
  }>) {
    return this.prisma.apiQuota.upsert({
      where: { tenantId },
      create: { tenantId, ...data } as any,
      update: data as any,
    });
  }

  async checkQuota(tenantId: string): Promise<{ allowed: boolean; remaining: { min: number; hour: number; day: number } }> {
    const quota = await this.getApiQuota(tenantId);
    const now = new Date();

    if (quota.resetMinAt && now > quota.resetMinAt) {
      quota.currentMin = 0;
    }
    if (quota.resetHourAt && now > quota.resetHourAt) {
      quota.currentHour = 0;
    }
    if (quota.resetDayAt && now > quota.resetDayAt) {
      quota.currentDay = 0;
    }

    const allowed = quota.currentMin < quota.requestsPerMin &&
                    quota.currentHour < quota.requestsPerHour &&
                    quota.currentDay < quota.requestsPerDay;

    return {
      allowed,
      remaining: {
        min: Math.max(0, quota.requestsPerMin - quota.currentMin),
        hour: Math.max(0, quota.requestsPerHour - quota.currentHour),
        day: Math.max(0, quota.requestsPerDay - quota.currentDay),
      },
    };
  }

  async incrementQuota(tenantId: string) {
    const quota = await this.getApiQuota(tenantId);
    const now = new Date();
    const minLater = new Date(now.getTime() + 60000);
    const hourLater = new Date(now.getTime() + 3600000);
    const dayLater = new Date(now.getTime() + 86400000);

    return this.prisma.apiQuota.update({
      where: { tenantId },
      data: {
        currentMin: { increment: 1 },
        currentHour: { increment: 1 },
        currentDay: { increment: 1 },
        resetMinAt: quota.resetMinAt || minLater,
        resetHourAt: quota.resetHourAt || hourLater,
        resetDayAt: quota.resetDayAt || dayLater,
      },
    });
  }

  // ─── Subscriptions ───────────────────────────────────────────

  async getAllSubscriptions(page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        include: { tenant: true, plan: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.subscription.count(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateSubscription(id: string, data: Partial<{
    planId: string; status: string; endDate: string; autoRenew: boolean;
  }>) {
    return this.prisma.subscription.update({
      where: { id },
      data: {
        ...data,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      } as any,
    });
  }

  // ─── Platform Stats ──────────────────────────────────────────

  async getPlatformStats() {
    const [tenants, users, orders, bookings, subscriptions] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.order.count(),
      this.prisma.booking.count(),
      this.prisma.subscription.count(),
    ]);

    const activeTenants = await this.prisma.tenant.count({ where: { status: 'published' } });
    const activeSubscriptions = await this.prisma.subscription.count({ where: { status: 'active' } });

    return {
      totalTenants: tenants,
      activeTenants,
      totalUsers: users,
      totalOrders: orders,
      totalBookings: bookings,
      totalSubscriptions: subscriptions,
      activeSubscriptions,
    };
  }
}
