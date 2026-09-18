import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async createTenant(adminUserId: string, data: {
    name: string; slug: string; description?: string; status?: 'draft' | 'published' | 'suspended' | 'rejected';
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

  async rejectTenant(tenantId: string, adminUserId: string, reason?: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { config: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.status === 'published') {
      throw new ForbiddenException('Published tenant cannot be rejected — use suspend');
    }

    const existingConfig = (tenant.config as any)?.config || {};

    await this.prisma.tenantConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        config: {
          rejectionReason: reason || null,
          rejectedAt: new Date().toISOString(),
          rejectedBy: adminUserId,
        },
      },
      update: {
        config: {
          ...existingConfig,
          rejectionReason: reason || null,
          rejectedAt: new Date().toISOString(),
          rejectedBy: adminUserId,
        },
      },
    });

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'rejected' as any },
    });
  }

  async getMerchantStats(adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const [total, draft, published, suspended, rejected] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'draft' } }),
      this.prisma.tenant.count({ where: { status: 'published' } }),
      this.prisma.tenant.count({ where: { status: 'suspended' } }),
      this.prisma.tenant.count({ where: { status: 'rejected' as any } }),
    ]);

    return { total, draft, published, suspended, rejected };
  }

  async deactivateTenant(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { config: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const config = (tenant.config as any) || {};
    if (config.scheduledDeletionAt) {
      const scheduledAt = new Date(config.scheduledDeletionAt);
      const daysRemaining = Math.ceil(
        (scheduledAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      return { message: `Tenant already scheduled for deletion in ${daysRemaining} days`, daysRemaining };
    }

    const scheduledDeletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'suspended',
        config: { ...config, scheduledDeletionAt: scheduledDeletionAt.toISOString() },
      },
    });
  }

  async getTenants(adminUserId: string, status?: string) {
    await this.verifyAdmin(adminUserId);

    const where: any = {};
    const allowedStatuses = ['draft', 'published', 'suspended', 'rejected'];
    if (status && allowedStatuses.includes(status)) where.status = status;

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

    const allTenants = await this.prisma.tenant.findMany({
      where: { status: 'suspended' },
      include: { config: true },
    });

    let deletedTenants = 0;
    for (const tenant of allTenants) {
      const config = (tenant.config as any) || {};
      if (config.scheduledDeletionAt && new Date(config.scheduledDeletionAt) <= thirtyDaysAgo) {
        await this.prisma.tenant.delete({ where: { id: tenant.id } });
        deletedTenants++;
      }
    }

    return { deletedUsers: deactivatedUsers.length, deletedTenants };
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
    name?: string; slug?: string; description?: string; status?: 'draft' | 'published' | 'suspended' | 'rejected';
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
