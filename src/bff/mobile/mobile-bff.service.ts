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
    const tenant = await this.releases.resolveTenant(identifier);
    if (!tenant || tenant.status !== 'published' || !tenant.activeReleaseId) {
      throw new NotFoundException({
        code: 'APP_NOT_APPROVED',
        message: 'This app is not approved for public delivery',
      });
    }

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
    const [featured, categories, grouped] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { status: 'published', activeReleaseId: { not: null } },
        select: { id: true, name: true, slug: true, logo: true },
        take: 10,
        orderBy: { publishedAt: 'desc' },
      }),
      this.getCategories(),
      this.prisma.tenant.groupBy({
        by: ['category'],
        _count: { id: true },
        where: { status: 'published', activeReleaseId: { not: null } },
      }),
    ]);
    const countByValue = new Map(grouped.map(row => [row.category ?? '', row._count.id]));
    // Categories render with live counts of the tenants they will actually surface.
    const withCounts = categories.map(category => {
      const values = this.tenantCategoryValues(category.id) ?? [];
      const count = values.reduce((sum, value) => sum + (countByValue.get(value) ?? 0), 0);
      return { ...category, count };
    });
    return { featured, categories: withCounts };
  }

  async getTenantsByCategory(categoryId: string) {
    const categories = await this.getCategories();
    const canonical = categories.find(
      category => category.id.toLowerCase() === categoryId.toLowerCase(),
    );
    const values = this.tenantCategoryValues(categoryId);
    if (!values) {
      // Unknown vertical — public consumers render "No apps yet" for empty lists.
      return { category: categoryId, categoryLabel: canonical?.name ?? categoryId, count: 0, data: [] };
    }

    const data = await this.prisma.tenant.findMany({
      where: {
        status: 'published',
        activeReleaseId: { not: null },
        category: { in: values },
      },
      select: { id: true, name: true, slug: true, logo: true, category: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    return {
      category: canonical?.id ?? categoryId,
      categoryLabel: canonical?.name ?? categoryId,
      count: data.length,
      data,
    };
  }

  /** Discovery vertical → merchant desk-category values it represents (canonical + legacy keys). */
  private tenantCategoryValues(categoryId: string): string[] | null {
    const groups: Record<string, string[]> = {
      commerce: ['Business', 'Ecommerce', 'Retail', 'Marketplace'],
      fashion: ['Business', 'Ecommerce', 'Retail'],
      restaurant: ['Food & Hospitality', 'Restaurant', 'Food Vendor', 'Cafe', 'Bar & Lounge', 'Bar'],
      grocery: ['Food & Hospitality', 'Grocery', 'Farm & Produce', 'Food Vendor'],
      salon: ['Services', 'Beauty & Salon', 'Barbershop'],
    };
    return groups[categoryId.toLowerCase()] ?? null;
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
    // B2C verticals live for discovery (kept in sync with discovery.service).
    // Institutions (school/church/hotel) are off the list for now.
    return Promise.resolve([
      { id: 'commerce', name: 'Commerce', icon: 'shopping-bag' },
      { id: 'restaurant', name: 'Restaurant', icon: 'utensils' },
      { id: 'fashion', name: 'Fashion', icon: 'shirt' },
      { id: 'grocery', name: 'Grocery', icon: 'shopping-cart' },
      { id: 'salon', name: 'Salon', icon: 'scissors' },
    ]);
  }
}
