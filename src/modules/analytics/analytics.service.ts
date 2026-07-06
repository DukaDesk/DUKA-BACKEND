import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  async trackEvent(data: {
    tenantId: string;
    userId?: string;
    event: string;
    category?: string;
    label?: string;
    value?: number;
    properties?: Record<string, any>;
    sessionId?: string;
    source?: string;
  }) {
    return this.prisma.analyticsEvent.create({ data: data as any });
  }

  async getEvents(tenantId: string, filters: {
    event?: string;
    category?: string;
    userId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = { tenantId };
    if (filters.event) where.event = filters.event;
    if (filters.category) where.category = filters.category;
    if (filters.userId) where.userId = filters.userId;
    if (filters.from || filters.to) {
      where.timestamp = {};
      if (filters.from) where.timestamp.gte = new Date(filters.from);
      if (filters.to) where.timestamp.lte = new Date(filters.to);
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 500);

    const [data, total] = await Promise.all([
      this.prisma.analyticsEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.analyticsEvent.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getEventAggregation(tenantId: string, event: string, period: 'hour' | 'day' | 'week' | 'month' = 'day', from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        tenantId,
        event,
        timestamp: { gte: fromDate, lte: toDate },
      },
      select: { timestamp: true },
      orderBy: { timestamp: 'asc' },
    });

    const buckets = new Map<string, number>();
    for (const e of events) {
      const d = new Date(e.timestamp);
      let key: string;
      switch (period) {
        case 'hour':
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`;
          break;
        case 'week': {
          const dayOfWeek = d.getDay();
          const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
          const monday = new Date(d.setDate(diff));
          key = monday.toISOString().split('T')[0];
          break;
        }
        case 'month':
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          break;
        default:
          key = d.toISOString().split('T')[0];
      }
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    return Array.from(buckets.entries()).map(([periodStr, count]) => ({
      period: periodStr,
      count,
    }));
  }

  async getRevenueReport(tenantId: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const [orders, financialEvents] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId,
          paidAt: { gte: fromDate, lte: toDate },
          paymentStatus: 'paid',
        },
      }),
      this.prisma.financialEvent.findMany({
        where: {
          tenantId,
          occurredAt: { gte: fromDate, lte: toDate },
          type: { in: ['payment', 'refund'] },
        },
      }),
    ]);

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalRefunds = financialEvents
      .filter((e) => e.type === 'refund')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    return {
      totalRevenue,
      totalRefunds,
      netRevenue: totalRevenue - totalRefunds,
      orderCount,
      avgOrderValue,
      currency: orders[0]?.currency || 'NGN',
      period: { from: fromDate, to: toDate },
    };
  }

  async getUserAnalytics(tenantId: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const tenantUsers = await this.prisma.tenantUser.findMany({
      where: { tenantId },
      include: { user: true },
    });

    const newUsers = tenantUsers.filter((tu) => {
      const joinedAt = tu.joinedAt;
      return joinedAt >= fromDate && joinedAt <= toDate;
    });

    const activeUsers = await this.prisma.analyticsEvent.groupBy({
      by: ['userId'],
      where: {
        tenantId,
        timestamp: { gte: fromDate, lte: toDate },
        userId: { not: null },
      },
    });

    return {
      totalUsers: tenantUsers.length,
      newUsers: newUsers.length,
      activeUsers: activeUsers.length,
      period: { from: fromDate, to: toDate },
    };
  }

  async getBookingAnalytics(tenantId: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const bookings = await this.prisma.booking.findMany({
      where: {
        tenantId,
        createdAt: { gte: fromDate, lte: toDate },
      },
    });

    const total = bookings.length;
    const confirmed = bookings.filter((b) => b.status === 'confirmed').length;
    const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
    const completed = bookings.filter((b) => b.status === 'completed').length;

    return {
      total,
      confirmed,
      cancelled,
      completed,
      cancellationRate: total > 0 ? (cancelled / total) * 100 : 0,
      period: { from: fromDate, to: toDate },
    };
  }

  async getDashboardSummary(tenantId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [revenue, userAnalytics, bookingAnalytics, orders] = await Promise.all([
      this.getRevenueReport(tenantId, thirtyDaysAgo.toISOString(), now.toISOString()),
      this.getUserAnalytics(tenantId, thirtyDaysAgo.toISOString(), now.toISOString()),
      this.getBookingAnalytics(tenantId, thirtyDaysAgo.toISOString(), now.toISOString()),
      this.prisma.order.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    return {
      revenue,
      users: userAnalytics,
      bookings: bookingAnalytics,
      orderCount: orders,
    };
  }
}
