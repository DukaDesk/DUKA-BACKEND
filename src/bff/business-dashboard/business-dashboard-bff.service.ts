import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class BusinessDashboardBffService {
  constructor(private prisma: PrismaService) {}

  async getPlatformOverview() {
    const [totalTenants, totalUsers, totalPlatformStaff, totalProducts, publishedTenants, inReviewTenants, totalOrders, totalRevenue] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          roles: {
            some: {
              tenantId: null,
              role: { name: { in: ['super_admin', 'platform_operator', 'support', 'operations', 'finance'] } },
            },
          },
        },
      }),
      this.prisma.product.count(),
      this.prisma.tenant.count({ where: { status: 'published' } }),
      this.prisma.tenant.count({ where: { appStatus: 'in_review' } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({ _sum: { total: true }, where: { paymentStatus: 'paid' } }),
    ]);

    return {
      totalTenants,
      publishedTenants,
      draftTenants: totalTenants - publishedTenants,
      inReviewTenants,
      totalUsers,
      totalPlatformStaff,
      totalProducts,
      totalOrders,
      totalRevenue: totalRevenue._sum.total || 0,
    };
  }

  async getTenantsList(
    adminUserId: string,
    status?: string,
    page = 1,
    limit = 20,
    verification?: string,
    appStatus?: string,
    search?: string,
    sort?: string,
    order?: string,
  ) {
    const access = await this.getDashboardAccess(adminUserId);
    const reviewerOnly = access === 'app-reviewer';
    const where: Prisma.TenantWhereInput = {};
    const normalizedSearch = search?.trim();
    if (reviewerOnly) {
      const reviewStatuses = ['in_review', 'approved', 'rejected'];
      where.appStatus = appStatus && reviewStatuses.includes(appStatus) ? appStatus : 'in_review';
      if (normalizedSearch) where.name = { contains: normalizedSearch, mode: 'insensitive' };
    } else {
      if (status === 'draft' || status === 'published' || status === 'suspended' || status === 'rejected') {
        where.status = status;
      }
      const allowedVerification = ['pending', 'verified', 'rejected'];
      if (verification && allowedVerification.includes(verification)) where.verificationStatus = verification;
      const allowedApp = ['none', 'in_review', 'approved', 'rejected'];
      if (appStatus && allowedApp.includes(appStatus)) where.appStatus = appStatus;

      if (normalizedSearch) {
        where.OR = [
          { name: { contains: normalizedSearch, mode: 'insensitive' } },
          { slug: { contains: normalizedSearch, mode: 'insensitive' } },
          { email: { contains: normalizedSearch, mode: 'insensitive' } },
          {
            users: {
              some: {
                role: 'owner',
                user: { email: { contains: normalizedSearch, mode: 'insensitive' } },
              },
            },
          },
        ];
      }
    }

    const pageValue = Number.isFinite(page) ? Math.floor(page) : 1;
    const limitValue = Number.isFinite(limit) ? Math.floor(limit) : 20;
    const safePage = Math.max(1, pageValue || 1);
    const safeLimit = Math.min(100, Math.max(1, limitValue || 20));
    const allowedSortFields = reviewerOnly
      ? ['name', 'appStatus', 'createdAt'] as const
      : ['name', 'status', 'verificationStatus', 'appStatus', 'createdAt'] as const;
    const sortField = allowedSortFields.find((field) => field === sort) ?? 'createdAt';
    const sortOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.TenantOrderByWithRelationInput = { [sortField]: sortOrder };
    const skip = (safePage - 1) * safeLimit;

    if (reviewerOnly) {
      const [data, total] = await Promise.all([
        this.prisma.tenant.findMany({
          where,
          select: { id: true, name: true, appStatus: true },
          skip,
          take: safeLimit,
          orderBy,
        }),
        this.prisma.tenant.count({ where }),
      ]);

      return {
        data,
        meta: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          _count: { select: { users: true, products: true, pages: true } },
          users: { where: { role: 'owner' }, take: 1, include: { user: { select: { email: true } } } },
          subscription: { include: { plan: { select: { name: true } } } },
        },
        skip,
        take: safeLimit,
        orderBy,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data: data.map((tenant) => ({
        ...tenant,
        email: tenant.email ?? tenant.users[0]?.user.email,
        plan: tenant.subscription?.plan?.name,
      })),
      meta: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
    };
  }

  private async getDashboardAccess(userId: string): Promise<'manager' | 'app-reviewer'> {
    const assignments = await this.prisma.userRole.findMany({
      where: {
        userId,
        tenantId: null,
        role: { name: { in: ['super_admin', 'platform_operator', 'operations'] } },
      },
      select: { role: { select: { name: true } } },
    });
    const roles = new Set(assignments.map((assignment) => assignment.role.name));
    if (roles.has('super_admin') || roles.has('platform_operator')) return 'manager';
    if (roles.has('operations')) return 'app-reviewer';
    throw new ForbiddenException('Platform admin permissions are required');
  }

  async getRecentAuditLogs(filters: {
    page?: number;
    limit?: number;
    search?: string;
    actor?: string;
    action?: string;
    resource?: string;
    outcome?: string;
    from?: string;
    to?: string;
    sort?: string;
    order?: string;
  } = {}) {
    const page = Math.max(1, Math.floor(Number(filters.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(filters.limit) || 20)));
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.action) where.action = filters.action;
    if (filters.actor?.trim()) {
      const actor = filters.actor.trim();
      where.user = {
        OR: [
          { id: actor },
          { email: { contains: actor, mode: 'insensitive' } },
        ],
      };
    }
    if (filters.resource?.trim()) {
      where.entity = { contains: filters.resource.trim(), mode: 'insensitive' };
    }
    if (filters.outcome && ['success', 'denied', 'failed'].includes(filters.outcome)) {
      where.metadata = { path: ['outcome'], equals: filters.outcome };
    }
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (filters.from || filters.to) {
      const parseDate = (value: string, endOfDay: boolean) => {
        const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
          : value;
        const parsed = new Date(normalized);
        if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid audit date filter');
        return parsed;
      };
      const gte = filters.from ? parseDate(filters.from, false) : undefined;
      const lte = filters.to ? parseDate(filters.to, true) : undefined;
      if (gte && lte && gte > lte) throw new BadRequestException('Audit date range is reversed');
      where.createdAt = { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
    }

    const allowedSort = {
      timestamp: 'createdAt',
      action: 'action',
      targetType: 'entity',
      targetId: 'entityId',
    } as const;
    const sortField = filters.sort && filters.sort in allowedSort
      ? allowedSort[filters.sort as keyof typeof allowedSort]
      : 'createdAt';
    const order: Prisma.SortOrder = filters.order === 'asc' ? 'asc' : 'desc';
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { [sortField]: order },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs.map((log) => {
        const metadata = this.safeAuditMetadata(log.metadata);
        return {
          id: log.id,
          timestamp: log.createdAt,
          adminEmail: log.user?.email || 'System',
          action: log.action,
          targetType: log.entity,
          targetId: log.entityId,
          outcome: metadata?.outcome ?? null,
          metadata,
        };
      }),
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  private safeAuditMetadata(metadata: Prisma.JsonValue | null) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    const values = metadata as Record<string, unknown>;
    const safe: Record<string, string | number> = {};
    for (const key of ['reason', 'version', 'releaseId', 'outcome', 'method', 'statusCode', 'requestId', 'errorType']) {
      const value = values[key];
      if (typeof value === 'string' || typeof value === 'number') safe[key] = value;
    }
    return Object.keys(safe).length ? safe : null;
  }

  async getAnalytics(dateFrom?: string, dateTo?: string, groupBy: 'day' | 'week' | 'month' = 'day') {
    const fromDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    const [orders, activeTenants, activeUsers, newUsers] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          paymentStatus: 'paid',
        },
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tenant.count({ where: { status: 'published' } }),
      this.prisma.analyticsEvent.groupBy({
        by: ['userId'],
        where: {
          timestamp: { gte: fromDate, lte: toDate },
          userId: { not: null },
        },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const buckets = new Map<string, { revenue: number; count: number }>();
    const userBuckets = new Map<string, number>();
    const periodKey = (value: Date) => {
      const d = new Date(value);
      switch (groupBy) {
        case 'week': {
          const dayOfWeek = d.getDay();
          const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
          return new Date(d.setDate(diff)).toISOString().split('T')[0];
        }
        case 'month':
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        default:
          return d.toISOString().split('T')[0];
      }
    };
    for (const order of orders) {
      const key = periodKey(order.createdAt);
      const existing = buckets.get(key) || { revenue: 0, count: 0 };
      existing.revenue += Number(order.total);
      existing.count += 1;
      buckets.set(key, existing);
    }
    for (const user of newUsers) {
      const key = periodKey(user.createdAt);
      userBuckets.set(key, (userBuckets.get(key) || 0) + 1);
    }

    const revenueTrend = Array.from(buckets.entries()).map(([period, data]) => ({
      period,
      revenue: data.revenue,
    }));
    const orderVolume = Array.from(buckets.entries()).map(([period, data]) => ({
      period,
      count: data.count,
    }));
    const userGrowth = Array.from(userBuckets.entries()).map(([period, count]) => ({
      period,
      count,
    }));

    const gmv = orders.reduce((sum, o) => sum + Number(o.total), 0);

    return {
      revenueTrend,
      orderVolume,
      userGrowth,
      gmv,
      activeTenants,
      activeUsers: activeUsers.length,
      period: { dateFrom, dateTo, groupBy },
    };
  }

  async getRevenueReport(dateFrom?: string, dateTo?: string, tenantId?: string, groupBy: 'day' | 'week' | 'month' = 'day') {
    const fromDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    const where: any = {
      createdAt: { gte: fromDate, lte: toDate },
      paymentStatus: 'paid',
    };
    if (tenantId) where.tenantId = tenantId;

    const orders = await this.prisma.order.findMany({
      where,
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const transactionCount = orders.length;
    const averageOrderValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;

    return { revenue: totalRevenue, transactionCount, averageOrderValue, period: { dateFrom, dateTo, tenantId, groupBy } };
  }

  async getMerchantAnalytics(merchantId: string, dateFrom?: string, dateTo?: string, groupBy: 'day' | 'week' | 'month' = 'day') {
    const fromDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    const [orders, activeUsers] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId: merchantId,
          createdAt: { gte: fromDate, lte: toDate },
        },
        select: { total: true, createdAt: true },
      }),
      this.prisma.analyticsEvent.groupBy({
        by: ['userId'],
        where: {
          tenantId: merchantId,
          timestamp: { gte: fromDate, lte: toDate },
          userId: { not: null },
        },
      }),
    ]);

    const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const orderCount = orders.length;
    const conversionRate = activeUsers.length > 0 ? (orderCount / activeUsers.length) * 100 : 0;

    return { merchantId, revenue, orderCount, activeUsers: activeUsers.length, conversionRate, period: { dateFrom, dateTo, groupBy } };
  }
}
