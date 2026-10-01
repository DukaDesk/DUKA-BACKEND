import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PublishingService } from '../publishing/publishing.service';
import { LivePreviewService } from '../builder/live-preview.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private publishingService: PublishingService,
    private livePreviewService: LivePreviewService,
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

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'published', publishedAt: new Date() },
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

  // ─── Two-stage approval ───────────────────────────────────
  // Stage-1: merchant identity verification (credentials review).
  // Leaves legacy TenantStatus untouched so existing filters keep working.

  async verifyMerchant(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    if (tenant.verificationStatus === 'verified') {
      return { message: 'Merchant already verified', tenantId: tenant.id };
    }

    // Single transaction so KYC approvals and the tenant flag can never drift apart.
    await this.prisma.$transaction([
      this.prisma.kycSubmission.updateMany({
        where: { tenantId, status: 'pending' },
        data: { status: 'approved', reviewedBy: adminUserId },
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { verificationStatus: 'verified', verifiedAt: new Date() },
      }),
    ]);

    return this.prisma.tenant.findUnique({ where: { id: tenantId } });
  }

  async rejectCredentials(tenantId: string, adminUserId: string, reason?: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    if (!reason?.trim()) throw new BadRequestException('A rejection reason is required');

    // Single transaction so KYC rejections and the tenant flag can never drift apart.
    await this.prisma.$transaction([
      this.prisma.kycSubmission.updateMany({
        where: { tenantId, status: 'pending' },
        data: { status: 'rejected', reviewNote: reason.trim(), reviewedBy: adminUserId },
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { verificationStatus: 'rejected' },
      }),
    ]);

    return this.prisma.tenant.findUnique({ where: { id: tenantId } });
  }

  async getCompliance(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    return this.prisma.kycSubmission.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Stage-2: app design review. Approve publishes the drafts (admin bypass
  // of the owner-only publish guard — the admin IS the approver here).

  async approveApp(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    if (tenant.verificationStatus !== 'verified') {
      throw new ForbiddenException('Merchant must pass stage-1 verification before the app can be approved');
    }
    if (tenant.appStatus === 'approved') {
      return { message: 'App already approved', tenantId };
    }

    const draftCount = await this.prisma.draftPage.count({ where: { tenantId } });
    if (draftCount === 0) {
      throw new BadRequestException('No app design submitted for review');
    }

    const result = await this.publishingService.publishAsAdmin(tenantId);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { appStatus: 'approved', appReviewedAt: new Date() },
    });

    return { ...result, appStatus: 'approved' };
  }

  async rejectApp(tenantId: string, adminUserId: string, reason?: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    if (!reason?.trim()) throw new BadRequestException('A rejection reason is required');

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { appStatus: 'rejected', appReviewedAt: new Date() },
    });

    return { message: 'App design rejected', tenantId, reason: reason.trim() };
  }

  // Full review bundle for the admin approval screen (single call).

  async getMerchantReview(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          where: { role: 'owner' },
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phoneNumber: true, emailVerified: true, phoneVerified: true, status: true } } },
        },
        subscription: { include: { plan: true } },
        theme: true,
        navigation: true,
      },
    });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    const [compliance, quota, draftPages, releases] = await Promise.all([
      this.prisma.kycSubmission.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.apiQuota.findUnique({ where: { tenantId } }),
      this.prisma.draftPage.findMany({
        where: { tenantId },
        select: { id: true, name: true, slug: true, isHome: true, sortOrder: true, _count: { select: { draftSections: true } } },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.release.findMany({
        where: { tenantId },
        select: { id: true, version: true, buildNumber: true, status: true, channel: true, publishedAt: true },
        orderBy: { buildNumber: 'desc' },
        take: 5,
      }),
    ]);

    return { tenant, compliance, quota, draftPages, releases };
  }

  // Draft live-preview for admin review (no publish required).

  async getMerchantPreview(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    return this.livePreviewService.previewTenant(tenantId);
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

  async getTenants(adminUserId: string, status?: string, verification?: string, appStatus?: string) {
    await this.verifyAdmin(adminUserId);

    const where: any = {};
    const allowedStatuses = ['draft', 'published', 'suspended', 'rejected'];
    if (status && allowedStatuses.includes(status)) where.status = status;
    const allowedVerification = ['pending', 'verified', 'rejected'];
    if (verification && allowedVerification.includes(verification)) where.verificationStatus = verification;
    const allowedApp = ['none', 'in_review', 'approved', 'rejected'];
    if (appStatus && allowedApp.includes(appStatus)) where.appStatus = appStatus;

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

    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

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
