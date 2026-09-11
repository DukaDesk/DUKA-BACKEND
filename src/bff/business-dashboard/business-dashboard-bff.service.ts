import { Injectable } from '@nestjs/common';
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

  async getTenantsList(status?: string, page = 1, limit = 20) {
    const where: any = {};
    if (status) where.status = status;

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          _count: { select: { users: true, products: true, pages: true } },
          subscription: { include: { plan: { select: { name: true } } } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
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
