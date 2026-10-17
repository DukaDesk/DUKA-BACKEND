import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async getPolicies() {
    return this.getAllSettings('policy');
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

  async getAllSubscriptions(
    page = 1,
    limit = 20,
    filters: { status?: string; plan?: string; search?: string; sort?: string; order?: string } = {},
  ) {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
    const where: Prisma.SubscriptionWhereInput = {};
    const allowedStatuses = ['active', 'past_due', 'canceled', 'trialing', 'paused', 'incomplete'];
    const status = filters.status?.toLowerCase();
    if (status && allowedStatuses.includes(status)) where.status = status;
    if (filters.plan?.trim()) where.plan = { slug: filters.plan.trim() };
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      where.OR = [
        { tenant: { name: { contains: search, mode: 'insensitive' } } },
        { tenant: { email: { contains: search, mode: 'insensitive' } } },
        { plan: { name: { contains: search, mode: 'insensitive' } } },
        { plan: { slug: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const order: Prisma.SortOrder = filters.order === 'asc' ? 'asc' : 'desc';
    const orderBy: Record<string, Prisma.SubscriptionOrderByWithRelationInput> = {
      createdAt: { createdAt: order },
      status: { status: order },
      currentPeriodEnd: { endDate: order },
      merchantName: { tenant: { name: order } },
      planName: { plan: { name: order } },
      amount: { plan: { price: order } },
    };
    const selectedOrder = orderBy[filters.sort || 'createdAt'] ?? orderBy.createdAt;
    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        include: { tenant: true, plan: true },
        orderBy: selectedOrder,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { data, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
  }

  async updateSubscription(id: string, data: Partial<{
    planId: string; status: string; endDate: string; autoRenew: boolean;
  }>) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BadRequestException('Subscription update body must be an object');
    }
    const update: Prisma.SubscriptionUncheckedUpdateInput = {};
    if (data.planId !== undefined) {
      if (typeof data.planId !== 'string' || !data.planId.trim()) {
        throw new BadRequestException('planId must be a non-empty string');
      }
      update.planId = data.planId;
    }
    if (data.status !== undefined) {
      if (typeof data.status !== 'string') throw new BadRequestException('Invalid subscription status');
      const allowedStatuses = ['active', 'past_due', 'canceled', 'trialing', 'paused', 'incomplete'];
      const status = data.status.toLowerCase();
      if (!allowedStatuses.includes(status)) throw new BadRequestException('Invalid subscription status');
      update.status = status;
    }
    if (data.endDate !== undefined) {
      if (typeof data.endDate !== 'string') throw new BadRequestException('Invalid subscription endDate');
      const endDate = new Date(data.endDate);
      if (Number.isNaN(endDate.getTime())) throw new BadRequestException('Invalid subscription endDate');
      update.endDate = endDate;
    }
    if (data.autoRenew !== undefined) {
      if (typeof data.autoRenew !== 'boolean') throw new BadRequestException('autoRenew must be a boolean');
      update.autoRenew = data.autoRenew;
    }
    if (Object.keys(update).length === 0) throw new BadRequestException('No supported subscription fields provided');

    return this.prisma.subscription.update({
      where: { id },
      data: update,
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
