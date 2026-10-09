import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ActiveReleaseService } from '../../shared/releases/active-release.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private releases: ActiveReleaseService,
  ) {}

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
    throw new BadRequestException({
      code: 'APP_REVIEW_REQUIRED',
      message: 'Approve the submitted app through the app review action; tenant approval does not publish an app',
    });
  }

  async suspendTenant(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'suspended' },
    });
  }

  async rejectTenant(tenantId: string, adminUserId: string, reason?: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { config: true } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
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

  async getMerchantAppReview(tenantId: string, adminUserId: string) {
    await this.verifyAppReviewer(adminUserId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        activeReleaseId: true,
        releases: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            version: true,
            status: true,
            channel: true,
            checksum: true,
            releaseNotes: true,
            publishedAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    const appStatus = tenant.releases[0]?.status === 'pending_review'
      ? 'in_review'
      : tenant.releases[0]?.status === 'rejected'
        ? 'rejected'
        : tenant.activeReleaseId ? 'approved' : 'none';

    return {
      tenant: { ...tenant, appStatus },
      appStatus,
      releases: tenant.releases,
      verificationStatus: 'not_implemented',
    };
  }

  async getMerchantAppPreview(tenantId: string, adminUserId: string) {
    await this.verifyAppReviewer(adminUserId);
    const release = await this.prisma.release.findFirst({
      where: { tenantId, status: 'pending_review' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, version: true, manifest: true, checksum: true, createdAt: true },
    });
    if (!release?.manifest) throw new NotFoundException({ code: 'APP_SUBMISSION_NOT_FOUND', message: 'No app submission is awaiting review' });
    const manifest = release.manifest as any;
    return {
      preview: {
        releaseId: release.id,
        version: release.version,
        checksum: release.checksum,
        submittedAt: release.createdAt,
        manifest,
        screens: Object.entries(manifest.screens || {}).map(([id, screen]) => ({ id, ...(screen as object) })),
      },
    };
  }

  async approveMerchantApp(tenantId: string, adminUserId: string) {
    await this.verifyAppReviewer(adminUserId);
    const candidate = await this.prisma.release.findFirst({
      where: { tenantId, status: 'pending_review' },
      orderBy: { createdAt: 'desc' },
    });
    if (!candidate) throw new NotFoundException({ code: 'APP_SUBMISSION_NOT_FOUND', message: 'No app submission is awaiting review' });
    if (!candidate.manifest) throw new BadRequestException({ code: 'APP_SUBMISSION_INVALID', message: 'Submitted app has no manifest' });

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, status: true } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    if (tenant.status === 'suspended' || tenant.status === 'rejected') {
      throw new ForbiddenException('Suspended or rejected merchants cannot be approved for mobile publication');
    }

    const publishedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.release.updateMany({
        where: { tenantId, status: 'published', channel: 'production' },
        data: { status: 'superseded' },
      });
      const promoted = await tx.release.updateMany({
        where: { id: candidate.id, status: 'pending_review' },
        data: { status: 'published', channel: 'production', publishedAt },
      });
      if (promoted.count !== 1) {
        throw new ConflictException('This app submission has already been reviewed');
      }
      await tx.tenant.update({
        where: { id: tenantId },
        data: { activeReleaseId: candidate.id, status: 'published', publishedAt },
      });
    });
    await this.releases.invalidate(tenantId, tenant.slug);
    return { message: 'App approved and published', tenantId, releaseId: candidate.id, version: candidate.version, status: 'published' };
  }

  async rejectMerchantApp(tenantId: string, adminUserId: string, reason?: string) {
    await this.verifyAppReviewer(adminUserId);
    if (!reason?.trim()) throw new BadRequestException('A rejection reason is required');
    const candidate = await this.prisma.release.findFirst({
      where: { tenantId, status: 'pending_review' },
      orderBy: { createdAt: 'desc' },
    });
    if (!candidate) throw new NotFoundException({ code: 'APP_SUBMISSION_NOT_FOUND', message: 'No app submission is awaiting review' });
    const outcome = await this.prisma.release.updateMany({
      where: { id: candidate.id, status: 'pending_review' },
      data: { status: 'rejected', releaseNotes: reason.trim() },
    });
    if (outcome.count !== 1) throw new ConflictException('This app submission has already been reviewed');
    return { message: 'App submission rejected', tenantId, release: { id: candidate.id, version: candidate.version, status: 'rejected', releaseNotes: reason.trim() } };
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
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

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
    const role = await this.prisma.userRole.findFirst({
      where: {
        userId,
        tenantId: null,
        role: { name: { in: ['super_admin', 'support', 'operations', 'finance'] } },
      },
    });
    if (!role) throw new ForbiddenException('Platform admin role required');
  }

  private async verifyAppReviewer(userId: string) {
    const role = await this.prisma.userRole.findFirst({
      where: {
        userId,
        tenantId: null,
        role: { name: { in: ['super_admin', 'operations'] } },
      },
    });
    if (!role) throw new ForbiddenException('App reviewer role required');
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

  async getTenantDetail(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: { users: true, products: true, pages: true },
        },
      },
    });

    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    return tenant;
  }

  async updateTenant(tenantId: string, adminUserId: string, data: {
    name?: string; slug?: string; description?: string; status?: 'draft' | 'published' | 'suspended' | 'rejected';
    config?: Record<string, any>;
  }) {
    await this.verifyAdmin(adminUserId);
    if (data.status === 'published') {
      throw new BadRequestException({
        code: 'APP_REVIEW_REQUIRED',
        message: 'Only app approval can activate a release for mobile delivery',
      });
    }

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

    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

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
