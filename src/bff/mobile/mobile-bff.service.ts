import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { ActiveReleaseService } from '../../shared/releases/active-release.service';

@Injectable()
export class MobileBffService {
  private readonly logger = new Logger(MobileBffService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private releases: ActiveReleaseService,
  ) {}

  /**
   * Canonical BFF manifest reader (B3).
   * Shares ActiveReleaseService with RendererService so both paths return
   * the identical active production snapshot + release receipt.
   */
  async getTenantManifest(identifier: string) {
    const cacheKey = `manifest:${identifier}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    const result = await this.releases.getActiveRelease(identifier);
    const payload = result.payload;

    // Immutable by release id — safe to cache the resolved payload briefly.
    await this.redis.set(cacheKey, JSON.stringify(payload), 300);
    await this.redis.set(
      `manifest:${result.slug}`,
      JSON.stringify(payload),
      300,
    );
    return payload;
  }

  async getDiscoveryFeed() {
    const [featured, categories] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { status: 'published', activeReleaseId: { not: null } },
        select: { id: true, name: true, slug: true, logo: true },
        take: 10,
        orderBy: { publishedAt: 'desc' },
      }),
      this.getCategories(),
    ]);

    return { featured, categories };
  }

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        tenants: {
          where: { status: 'active' },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true, logo: true, status: true },
            },
          },
        },
        consents: {
          include: { scopes: true, tenant: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
    if (!user) return null;
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async getNotifications(userId: string) {
    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { data: notifications, unreadCount };
  }

  async getTenantCatalog(
    tenantId: string,
    query: { page?: string; limit?: string; categoryId?: string; search?: string },
  ) {
    const where: any = { tenantId, isActive: true };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const page = parseInt(query.page || '1', 10) || 1;
    const limit = parseInt(query.limit || '20', 10) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          images: true,
          category: { select: { id: true, name: true, slug: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  private getCategories() {
    return Promise.resolve([
      { id: 'commerce', name: 'Commerce', icon: 'shopping-bag' },
      { id: 'restaurant', name: 'Restaurant', icon: 'utensils' },
      { id: 'fashion', name: 'Fashion', icon: 'shirt' },
      { id: 'grocery', name: 'Grocery', icon: 'shopping-cart' },
      { id: 'clinic', name: 'Clinic', icon: 'stethoscope' },
      { id: 'salon', name: 'Salon', icon: 'scissors' },
      { id: 'school', name: 'School', icon: 'graduation-cap' },
      { id: 'church', name: 'Church', icon: 'cross' },
      { id: 'hotel', name: 'Hotel', icon: 'building' },
    ]);
  }
}
