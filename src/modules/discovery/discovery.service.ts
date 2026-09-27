import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class DiscoveryService {
  constructor(private prisma: PrismaService) {}

  /**
   * B7 — discovery projects published name/slug/logo and the active release
   * identity, and only for tenants that have been activated
   * (`activeReleaseId` set). Draft/suspended/unactivated tenants stay hidden.
   */
  private async listActivatedTenants(
    where: Record<string, any>,
    orderBy?: Record<string, 'asc' | 'desc'>,
    take?: number,
  ) {
    const tenants = await this.prisma.tenant.findMany({
      where: { ...where, activeReleaseId: { not: null } },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        publishedAt: true,
        activeReleaseId: true,
      },
      orderBy,
      take,
    });

    const releaseIds = tenants
      .map((tenant) => tenant.activeReleaseId)
      .filter((id): id is string => !!id);
    const releases = releaseIds.length
      ? await this.prisma.release.findMany({
          where: { id: { in: releaseIds } },
          select: {
            id: true,
            tenantId: true,
            version: true,
            checksum: true,
            channel: true,
            publishedAt: true,
          },
        })
      : [];
    const byId = new Map(releases.map((release) => [release.id, release]));

    return tenants.map(({ activeReleaseId, ...tenant }) => ({
      ...tenant,
      release: activeReleaseId ? (byId.get(activeReleaseId) ?? null) : null,
    }));
  }

  async getFeatured() {
    return this.listActivatedTenants({ status: 'published' }, { publishedAt: 'desc' }, 10);
  }

  async search(query: string) {
    return this.listActivatedTenants(
      { status: 'published', name: { contains: query, mode: 'insensitive' } },
      { name: 'asc' },
      20,
    );
  }

  async getCategories() {
    const categories = [
      { id: 'commerce', name: 'Commerce', icon: 'shopping-bag' },
      { id: 'restaurant', name: 'Restaurant', icon: 'utensils' },
      { id: 'fashion', name: 'Fashion', icon: 'shirt' },
      { id: 'grocery', name: 'Grocery', icon: 'shopping-cart' },
      { id: 'clinic', name: 'Clinic', icon: 'stethoscope' },
      { id: 'salon', name: 'Salon', icon: 'scissors' },
      { id: 'law-firm', name: 'Law Firm', icon: 'scale' },
      { id: 'church', name: 'Church', icon: 'cross' },
      { id: 'mosque', name: 'Mosque', icon: 'mosque' },
      { id: 'ngo', name: 'NGO', icon: 'heart' },
      { id: 'school', name: 'School', icon: 'graduation-cap' },
      { id: 'coaching', name: 'Coaching', icon: 'book-open' },
    ];
    return categories;
  }

  async getNearby(lat: number, lng: number) {
    void lat;
    void lng;
    return this.listActivatedTenants({ status: 'published' }, undefined, 20);
  }
}
