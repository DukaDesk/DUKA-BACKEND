import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async createTenant(adminUserId: string, data: {
    name: string; slug: string; description?: string; status?: 'draft' | 'published' | 'suspended';
    config?: Record<string, any>;
  }) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        status: data.status || 'draft',
        config: data.config || {},
        ownerId: adminUserId,
      },
    });

    return tenant;
  }

  async approveTenant(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'published', publishedAt: new Date() },
    });
  }

  async suspendTenant(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'suspended' },
    });
  }

  async getTenants(adminUserId: string, status?: string) {
    await this.verifyAdmin(adminUserId);

    const where: any = {};
    if (status) where.status = status;

    return this.prisma.tenant.findMany({
      where,
      include: { _count: { select: { users: true, products: true, pages: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const [totalTenants, totalUsers, totalProducts, publishedTenants] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.product.count(),
      this.prisma.tenant.count({ where: { status: 'published' } }),
    ]);

    return {
      totalTenants,
      publishedTenants,
      draftTenants: totalTenants - publishedTenants,
      totalUsers,
      totalProducts,
    };
  }

  private async verifyAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
  }

  async cleanupDeactivatedAccounts() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deactivatedUsers = await this.prisma.user.findMany({
      where: {
        status: 'deactivated',
        scheduledDeletionAt: {
          lte: thirtyDaysAgo,
        },
      },
    });

    await this.prisma.user.deleteMany({
      where: {
        status: 'deactivated',
        scheduledDeletionAt: {
          lte: thirtyDaysAgo,
        },
      },
    });

    return { deletedCount: deactivatedUsers.length };
  }

  async getTenantDetail(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: { users: true, products: true, pages: true },
        },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    return tenant;
  }

  async updateTenant(tenantId: string, adminUserId: string, data: {
    name?: string; slug?: string; description?: string; status?: 'draft' | 'published' | 'suspended';
    config?: Record<string, any>;
  }) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        status: data.status,
        config: data.config,
      },
    });

    return tenant;
  }

  async getTenantSettings(tenantId: string, category?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { config: true },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    const settings = tenant.config || {};
    if (category) {
      return { [category]: settings[category] };
    }
    return settings;
  }

  async updateTenantSetting(tenantId: string, key: string, data: any, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { config: { [key]: data } },
    });

    return tenant;
  }
}
