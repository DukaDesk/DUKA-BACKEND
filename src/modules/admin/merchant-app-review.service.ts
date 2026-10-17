import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PublishingService } from '../publishing/publishing.service';

@Injectable()
export class MerchantAppReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publishingService: PublishingService,
  ) {}

  private async verifyReviewer(adminUserId: string) {
    const reviewer = await this.prisma.userRole.findFirst({
      where: {
        userId: adminUserId,
        tenantId: null,
        role: { name: { in: ['super_admin', 'operations'] } },
      },
      select: { id: true },
    });
    if (!reviewer) throw new ForbiddenException('Merchant app review permissions are required');
  }

  async getReview(tenantId: string, adminUserId: string) {
    await this.verifyReviewer(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, appStatus: true, appSubmittedAt: true },
    });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    const [draftPages, releases] = await Promise.all([
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

    const homePage = draftPages.find((page) => page.isHome) ?? draftPages[0];
    return {
      tenant,
      appStatus: tenant.appStatus,
      app: tenant.appStatus !== 'none'
        ? { name: homePage?.name ?? tenant.name, slug: homePage?.slug ?? tenant.slug, submittedAt: tenant.appSubmittedAt }
        : undefined,
      draftPages,
      releases,
    };
  }

  async approveApp(tenantId: string, adminUserId: string) {
    await this.verifyReviewer(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    if (tenant.appStatus === 'approved') return tenant;
    if (tenant.appStatus !== 'in_review') {
      throw new ConflictException('The app must be submitted for review before it can be approved');
    }

    const [draftCount, submittedDraft] = await Promise.all([
      this.prisma.draftPage.count({ where: { tenantId, isActive: true } }),
      this.prisma.draft.findUnique({ where: { id: `${tenantId}-draft` } }),
    ]);
    const hasSubmittedManifest = submittedDraft?.status === 'in_review' && !!submittedDraft.manifest;
    if (draftCount === 0 && !hasSubmittedManifest) {
      throw new BadRequestException('No app design submitted for review');
    }

    const result = await this.publishingService.publishAsAdmin(tenantId);
    const [updated] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { appStatus: 'approved', appReviewedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: { tenantId, userId: adminUserId, action: 'merchant.app_approve', entity: 'tenant', entityId: tenantId, metadata: { outcome: 'success', version: result.version, releaseId: result.releaseId } },
      }),
    ]);
    return updated;
  }

  async rejectApp(tenantId: string, adminUserId: string, reason?: string) {
    await this.verifyReviewer(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    if (tenant.appStatus === 'rejected') return tenant;
    if (tenant.appStatus !== 'in_review') {
      throw new ConflictException('An app in review is required before it can be rejected');
    }
    const trimmedReason = reason?.trim();
    if (!trimmedReason) throw new BadRequestException('A rejection reason is required');

    const [updated] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { appStatus: 'rejected', appReviewedAt: new Date(), appReviewNote: trimmedReason },
      }),
      this.prisma.auditLog.create({
        data: { tenantId, userId: adminUserId, action: 'merchant.app_reject', entity: 'tenant', entityId: tenantId, metadata: { outcome: 'success', reason: trimmedReason } },
      }),
    ]);
    return updated;
  }
}
