import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AnalyticsService } from './analytics.service';

export const WIDGET_TYPES = [
  { type: 'metric', label: 'Single Metric', description: 'Displays a single numeric value (revenue, count, etc.)' },
  { type: 'chart', label: 'Chart', description: 'Displays a time-series chart (line or bar)' },
  { type: 'table', label: 'Table', description: 'Displays a data table with rows and columns' },
  { type: 'list', label: 'List', description: 'Displays a list of items' },
] as const;

export const WIDGET_METRICS = [
  { metric: 'revenue', label: 'Total Revenue', type: 'metric', dataset: 'orders' },
  { metric: 'order_count', label: 'Order Count', type: 'metric', dataset: 'orders' },
  { metric: 'user_count', label: 'User Count', type: 'metric', dataset: 'users' },
  { metric: 'booking_count', label: 'Booking Count', type: 'metric', dataset: 'bookings' },
  { metric: 'product_count', label: 'Product Count', type: 'metric', dataset: 'products' },
  { metric: 'revenue_trend', label: 'Revenue Trend', type: 'chart', dataset: 'orders' },
  { metric: 'order_volume', label: 'Order Volume', type: 'chart', dataset: 'orders' },
  { metric: 'user_growth', label: 'User Growth', type: 'chart', dataset: 'users' },
  { metric: 'recent_orders', label: 'Recent Orders', type: 'table', dataset: 'orders' },
  { metric: 'top_products', label: 'Top Products', type: 'list', dataset: 'products' },
] as const;

@Injectable()
export class DashboardsService {
  private readonly logger = new Logger(DashboardsService.name);

  constructor(
    private prisma: PrismaService,
    private analyticsService: AnalyticsService,
  ) {}

  async create(tenantId: string, data: {
    name: string; slug: string; description?: string; layout?: Record<string, any>;
  }) {
    return this.prisma.dashboard.create({ data: { tenantId, ...data } as any });
  }

  async findAll(tenantId: string) {
    return this.prisma.dashboard.findMany({
      where: { tenantId },
      include: { widgets: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id, tenantId },
      include: { widgets: { orderBy: { position: 'asc' } } },
    });
    if (!dashboard) throw new NotFoundException('Dashboard not found');
    return dashboard;
  }

  async update(tenantId: string, id: string, data: Partial<{
    name: string; slug: string; description?: string; layout?: Record<string, any>; isDefault?: boolean;
  }>) {
    await this.findOne(tenantId, id);
    return this.prisma.dashboard.update({ where: { id }, data: data as any });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.dashboard.delete({ where: { id } });
  }

  async addWidget(tenantId: string, dashboardId: string, data: {
    type: string; title: string; subtitle?: string;
    config?: Record<string, any>; position?: number;
    width?: number; height?: number; metric?: string; dataset?: string; query?: Record<string, any>;
  }) {
    await this.findOne(tenantId, dashboardId);
    return this.prisma.dashboardWidget.create({ data: { dashboardId, ...data } as any });
  }

  async updateWidget(tenantId: string, dashboardId: string, widgetId: string, data: Partial<{
    type: string; title: string; subtitle?: string;
    config?: Record<string, any>; position?: number;
    width?: number; height?: number; metric?: string; dataset?: string; query?: Record<string, any>;
  }>) {
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: { id: widgetId, dashboardId },
    });
    if (!widget) throw new NotFoundException('Widget not found');

    return this.prisma.dashboardWidget.update({ where: { id: widgetId }, data: data as any });
  }

  async removeWidget(tenantId: string, dashboardId: string, widgetId: string) {
    await this.findOne(tenantId, dashboardId);
    return this.prisma.dashboardWidget.delete({ where: { id: widgetId } });
  }

  getWidgetTypes() {
    return { types: WIDGET_TYPES, metrics: WIDGET_METRICS };
  }

  async resolveWidgetData(tenantId: string, widget: {
    type: string; metric?: string | null; dataset?: string | null;
    query?: any; config?: any;
  }) {
    const metric = widget.metric || 'revenue';
    const query = (widget.query as Record<string, any>) || {};
    const from = query.from as string | undefined;
    const to = query.to as string | undefined;

    try {
      switch (metric) {
        case 'revenue': {
          const report = await this.analyticsService.getRevenueReport(tenantId, from, to);
          return { metric, value: report.totalRevenue, currency: report.currency, period: report.period };
        }
        case 'order_count': {
          const where: any = { tenantId };
          if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
          }
          const count = await this.prisma.order.count({ where });
          return { metric, value: count, period: { from, to } };
        }
        case 'user_count': {
          const count = await this.prisma.tenantUser.count({ where: { tenantId } });
          return { metric, value: count };
        }
        case 'booking_count': {
          const where: any = { tenantId };
          if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
          }
          const count = await this.prisma.booking.count({ where });
          return { metric, value: count, period: { from, to } };
        }
        case 'product_count': {
          const count = await this.prisma.product.count({ where: { tenantId } });
          return { metric, value: count };
        }
        case 'revenue_trend': {
          const groupBy = (query.groupBy as string) || 'day';
          const trend = await this.getRevenueTrend(tenantId, groupBy as any, from, to);
          return { metric, data: trend, period: { from, to, groupBy } };
        }
        case 'order_volume': {
          const groupBy = (query.groupBy as string) || 'day';
          const volume = await this.getOrderVolume(tenantId, groupBy as any, from, to);
          return { metric, data: volume, period: { from, to, groupBy } };
        }
        case 'user_growth': {
          const groupBy = (query.groupBy as string) || 'day';
          const growth = await this.getUserGrowth(tenantId, groupBy as any, from, to);
          return { metric, data: growth, period: { from, to, groupBy } };
        }
        case 'recent_orders': {
          const limit = (query.limit as number) || 10;
          const orders = await this.prisma.order.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { id: true, total: true, currency: true, status: true, paymentStatus: true, createdAt: true },
          });
          return { metric, data: orders };
        }
        case 'top_products': {
          const limit = (query.limit as number) || 10;
          const products = await this.prisma.product.findMany({
            where: { tenantId },
            take: limit,
            select: { id: true, name: true, price: true, type: true },
          });
          return { metric, data: products };
        }
        default:
          return { metric, error: `Unknown metric: ${metric}` };
      }
    } catch (error: any) {
      this.logger.warn(`Failed to resolve widget metric "${metric}": ${error.message}`);
      return { metric, error: error.message };
    }
  }

  async resolveDashboardData(tenantId: string, dashboardId: string) {
    const dashboard = await this.findOne(tenantId, dashboardId);
    const widgetData = await Promise.all(
      dashboard.widgets.map(async (widget) => {
        const data = await this.resolveWidgetData(tenantId, widget);
        return { widgetId: widget.id, type: widget.type, title: widget.title, ...data };
      }),
    );
    return { dashboardId: dashboard.id, name: dashboard.name, widgets: widgetData };
  }

  private async getRevenueTrend(tenantId: string, groupBy: 'day' | 'week' | 'month', from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const orders = await this.prisma.order.findMany({
      where: { tenantId, paymentStatus: 'paid', createdAt: { gte: fromDate, lte: toDate } },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    return this.groupByPeriod(orders.map((o) => ({ date: o.createdAt, value: Number(o.total) })), groupBy);
  }

  private async getOrderVolume(tenantId: string, groupBy: 'day' | 'week' | 'month', from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const orders = await this.prisma.order.findMany({
      where: { tenantId, createdAt: { gte: fromDate, lte: toDate } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return this.groupByPeriod(orders.map((o) => ({ date: o.createdAt, value: 1 })), groupBy);
  }

  private async getUserGrowth(tenantId: string, groupBy: 'day' | 'week' | 'month', from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const users = await this.prisma.tenantUser.findMany({
      where: { tenantId, joinedAt: { gte: fromDate, lte: toDate } },
      select: { joinedAt: true },
      orderBy: { joinedAt: 'asc' },
    });

    return this.groupByPeriod(users.map((u) => ({ date: u.joinedAt, value: 1 })), groupBy);
  }

  private groupByPeriod(items: { date: Date; value: number }[], groupBy: 'day' | 'week' | 'month') {
    const buckets = new Map<string, number>();
    for (const item of items) {
      const d = new Date(item.date);
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
      buckets.set(key, (buckets.get(key) || 0) + item.value);
    }
    return Array.from(buckets.entries()).map(([period, value]) => ({ period, value }));
  }
}
