import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class MerchantAppReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getReview(tenantId: string, adminUserId: string) {
    const reviewer = await this.prisma.userRole.findFirst({
      where: {
        userId: adminUserId,
        tenantId: null,
        role: { name: { in: ['super_admin', 'operations'] } },
      },
      select: { id: true },
    });
    if (!reviewer) throw new ForbiddenException('Merchant app review permissions are required');

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
}
