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
}
