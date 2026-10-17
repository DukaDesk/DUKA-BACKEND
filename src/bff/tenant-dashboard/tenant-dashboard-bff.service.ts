import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class TenantDashboardBffService {
  constructor(private prisma: PrismaService) {}

  private async assertTenantMembership(userId: string, tenantId: string) {
    const membership = await this.prisma.tenantUser.findFirst({
      where: { userId, tenantId, status: 'active' },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('Active membership in this tenant is required');
  }

  async getDashboardSummary(userId: string, tenantId: string) {
    await this.assertTenantMembership(userId, tenantId);
    const [pages, products, orders, bookings] = await Promise.all([
      this.prisma.page.count({ where: { tenantId, isActive: true } }),
      this.prisma.product.count({ where: { tenantId, isActive: true } }),
      this.prisma.order.count({ where: { tenantId } }),
      this.prisma.booking.count({ where: { tenantId } }),
    ]);

    return { pages, products, orders, bookings };
  }

  async getAnalyticsSummary(userId: string, tenantId: string) {
    await this.assertTenantMembership(userId, tenantId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recentOrders, recentBookings] = await Promise.all([
      this.prisma.order.findMany({
        where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.booking.findMany({
        where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const totalRevenue = recentOrders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + Number(o.total), 0);

    return {
      period: '30d',
      totalRevenue,
      ordersCount: recentOrders.length,
      bookingsCount: recentBookings.length,
      recentOrders,
      recentBookings,
    };
  }

  async getIntegrationStatus(userId: string, tenantId: string) {
    await this.assertTenantMembership(userId, tenantId);
    const accounts = await this.prisma.tenantPaymentAccount.findMany({
      where: { tenantId },
      include: { provider: true },
    });

    return accounts.map((a) => ({
      provider: a.provider.name,
      environment: a.environment,
      status: a.status,
      isDefault: a.isDefault,
    }));
  }
}
