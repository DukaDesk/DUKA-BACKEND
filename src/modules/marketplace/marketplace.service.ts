import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService) {}

  // ─── Marketplace Listings ────────────────────────────────────

  async createListing(data: {
    name: string; slug: string; type?: string; description?: string;
    version?: string; author?: string; price?: number; currency?: string;
    categories?: string[]; tags?: string[]; screenshots?: string[];
    iconUrl?: string; readme?: string; configSchema?: Record<string, any>;
    permissions?: string[]; dependencies?: Record<string, any>;
    isFree?: boolean; isPublished?: boolean;
  }) {
    return this.prisma.marketplaceListing.create({ data: data as any });
  }

  async getPublishedListings(type?: string, page = 1, limit = 20) {
    const where: any = { isPublished: true };
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.prisma.marketplaceListing.findMany({
        where,
        orderBy: { downloads: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.marketplaceListing.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getAllListings(page = 1, limit = 50) {
    const [data, total] = await Promise.all([
      this.prisma.marketplaceListing.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.marketplaceListing.count(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getListing(slug: string) {
    const listing = await this.prisma.marketplaceListing.findUnique({ where: { slug } });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  async updateListing(slug: string, data: Partial<{
    name: string; description: string; version: string; price: number;
    categories: string[]; tags: string[]; screenshots: string[];
    iconUrl: string; readme: string; configSchema: Record<string, any>;
    permissions: string[]; isPublished: boolean; isFree: boolean;
  }>) {
    return this.prisma.marketplaceListing.update({ where: { slug }, data: data as any });
  }

  async deleteListing(slug: string) {
    return this.prisma.marketplaceListing.delete({ where: { slug } });
  }

  async recordDownload(slug: string) {
    return this.prisma.marketplaceListing.update({
      where: { slug },
      data: { downloads: { increment: 1 } },
    });
  }

  // ─── Plugin Installation ─────────────────────────────────────

  async installPlugin(tenantId: string, listingSlug: string) {
    const listing = await this.getListing(listingSlug);
    if (!listing.isPublished) throw new BadRequestException('Listing is not published');

    const existing = await this.prisma.pluginInstallation.findUnique({
      where: { tenantId_listingId: { tenantId, listingId: listing.id } },
    });
    if (existing) throw new BadRequestException('Plugin already installed');

    return this.prisma.pluginInstallation.create({
      data: {
        tenantId,
        listingId: listing.id,
        version: listing.version,
        status: 'installed',
      } as any,
    });
  }

  async getInstalledPlugins(tenantId: string) {
    return this.prisma.pluginInstallation.findMany({
      where: { tenantId },
      include: { listing: true },
      orderBy: { installedAt: 'desc' },
    });
  }

  async updatePluginConfig(tenantId: string, listingSlug: string, config: Record<string, any>) {
    const listing = await this.getListing(listingSlug);
    const installation = await this.prisma.pluginInstallation.findUnique({
      where: { tenantId_listingId: { tenantId, listingId: listing.id } },
    });
    if (!installation) throw new NotFoundException('Plugin not installed');

    return this.prisma.pluginInstallation.update({
      where: { id: installation.id },
      data: { config: config as any },
    });
  }

  async uninstallPlugin(tenantId: string, listingSlug: string) {
    const listing = await this.getListing(listingSlug);
    await this.prisma.pluginInstallation.delete({
      where: { tenantId_listingId: { tenantId, listingId: listing.id } },
    });
    return { message: 'Plugin uninstalled' };
  }

  async togglePlugin(tenantId: string, listingSlug: string, isActive: boolean) {
    const listing = await this.getListing(listingSlug);
    return this.prisma.pluginInstallation.update({
      where: { tenantId_listingId: { tenantId, listingId: listing.id } },
      data: { isActive },
    });
  }

  async getPluginStats() {
    const [totalListings, totalInstalls, totalDownloads] = await Promise.all([
      this.prisma.marketplaceListing.count(),
      this.prisma.pluginInstallation.count(),
      this.prisma.marketplaceListing.aggregate({ _sum: { downloads: true } }),
    ]);

    return {
      totalListings,
      totalInstalls,
      totalDownloads: totalDownloads._sum.downloads || 0,
    };
  }
}
