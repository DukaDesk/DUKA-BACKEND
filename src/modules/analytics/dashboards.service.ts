import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class DashboardsService {
  constructor(private prisma: PrismaService) {}

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
}
