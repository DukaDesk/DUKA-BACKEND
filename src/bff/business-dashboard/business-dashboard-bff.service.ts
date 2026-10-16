import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class BusinessDashboardBffService {
  constructor(private prisma: PrismaService) {}

  async getPlatformOverview() {
    const [totalTenants, totalUsers, totalProducts, publishedTenants, totalOrders, totalRevenue] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.product.count(),
      this.prisma.tenant.count({ where: { status: 'published' } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({ _sum: { total: true }, where: { paymentStatus: 'paid' } }),
    ]);

    return {
      totalTenants,
      publishedTenants,
      draftTenants: totalTenants - publishedTenants,
      totalUsers,
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
    await this.verifyAdmin(adminUserId);
    const where: Prisma.TenantWhereInput = {};
    if (status === 'draft' || status === 'published' || status === 'suspended' || status === 'rejected') {
      where.status = status;
    }
    const allowedVerification = ['pending', 'verified', 'rejected'];
    if (verification && allowedVerification.includes(verification)) where.verificationStatus = verification;
    const allowedApp = ['none', 'in_review', 'approved', 'rejected'];
    if (appStatus && allowedApp.includes(appStatus)) where.appStatus = appStatus;

    const normalizedSearch = search?.trim();
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

    const pageValue = Number.isFinite(page) ? Math.floor(page) : 1;
    const limitValue = Number.isFinite(limit) ? Math.floor(limit) : 20;
    const safePage = Math.max(1, pageValue || 1);
    const safeLimit = Math.min(100, Math.max(1, limitValue || 20));
    const allowedSortFields = ['name', 'status', 'verificationStatus', 'appStatus', 'createdAt'] as const;
    const sortField = allowedSortFields.find((field) => field === sort) ?? 'createdAt';
    const sortOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.TenantOrderByWithRelationInput = { [sortField]: sortOrder };
    const skip = (safePage - 1) * safeLimit;
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

  private async verifyAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    const role = await this.prisma.userRole.findFirst({
      where: { userId, tenantId: null, role: { name: { in: ['super_admin', 'operations', 'support'] } } },
      select: { id: true },
    });
    if (!role) throw new ForbiddenException('Platform admin permissions are required');
  }

  async getRecentAuditLogs(limit = 20) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  async getAnalytics(dateFrom?: string, dateTo?: string, groupBy: 'day' | 'week' | 'month' = 'day') {
    const fromDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = dateTo ? new Date(dateTo) : new Date();

    const [orders, activeTenants] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          paymentStatus: 'paid',
        },
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tenant.count({ where: { status: 'published' } }),
    ]);

    const buckets = new Map<string, { revenue: number; count: number }>();
    for (const order of orders) {
      const d = new Date(order.createdAt);
      let key: string;
      switch (groupBy) {
        case 'week': {
          const dayOfWeek = d.getDay();
          const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
          key = new Date(d.setDate(diff)).toISOString().split('T')[0];
          break;
        }
        case 'month':
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          break;
        default:
          key = d.toISOString().split('T')[0];
      }
      const existing = buckets.get(key) || { revenue: 0, count: 0 };
      existing.revenue += Number(order.total);
      existing.count += 1;
      buckets.set(key, existing);
    }

    const revenueTrend = Array.from(buckets.entries()).map(([period, data]) => ({
      period,
      revenue: data.revenue,
    }));
    const orderVolume = Array.from(buckets.entries()).map(([period, data]) => ({
      period,
      count: data.count,
    }));

    const gmv = orders.reduce((sum, o) => sum + Number(o.total), 0);

    return { revenueTrend, orderVolume, gmv, activeTenants, period: { dateFrom, dateTo, groupBy } };
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
