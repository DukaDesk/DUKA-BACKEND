import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class MobileBffService {
  private readonly logger = new Logger(MobileBffService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getTenantManifest(identifier: string) {
    const cacheKey = `manifest:${identifier}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const tenant = await this.prisma.tenant.findFirst({
      where: { OR: [{ id: identifier }, { slug: identifier }] },
      include: {
        theme: true,
        navigation: true,
        pages: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            sections: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                components: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
        config: true,
        subscription: { include: { plan: true } },
      },
    });

    if (!tenant) return null;

    const features = tenant.subscription?.plan?.features as Record<string, boolean> || {};

    const manifest = {
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      theme: tenant.theme || {
        primaryColor: '#0066FF',
        secondaryColor: '#00CC66',
        backgroundColor: '#FFFFFF',
        textColor: '#1A1A1A',
        fontFamily: 'Inter',
        borderRadius: '8px',
      },
      navigation: tenant.navigation?.items || [],
      config: tenant.config || { currency: 'NGN', timezone: 'Africa/Lagos' },
      features,
      screens: tenant.pages.map((page) => ({
        name: page.name,
        slug: page.slug,
        isHome: page.isHome,
        blocks: page.sections.map((section) => ({
          id: section.id,
          type: section.type,
          config: section.config,
          components: section.components.map((c) => ({
            id: c.id,
            type: c.type,
            props: c.props,
          })),
        })),
      })),
    };

    await this.redis.set(cacheKey, JSON.stringify(manifest), 300);
    return manifest;
  }

  async getDiscoveryFeed() {
    const [featured, categories] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { status: 'published' },
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

  async getTenantCatalog(tenantId: string, query: { page?: string; limit?: string; categoryId?: string; search?: string }) {
    const where: any = { tenantId, isActive: true };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const page = parseInt(query.page || '1') || 1;
    const limit = parseInt(query.limit || '20') || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { images: true, category: { select: { id: true, name: true, slug: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  private async getCategories() {
    return [
      { id: 'commerce', name: 'Commerce', icon: 'shopping-bag' },
      { id: 'restaurant', name: 'Restaurant', icon: 'utensils' },
      { id: 'fashion', name: 'Fashion', icon: 'shirt' },
      { id: 'grocery', name: 'Grocery', icon: 'shopping-cart' },
      { id: 'clinic', name: 'Clinic', icon: 'stethoscope' },
      { id: 'salon', name: 'Salon', icon: 'scissors' },
      { id: 'school', name: 'School', icon: 'graduation-cap' },
      { id: 'church', name: 'Church', icon: 'cross' },
      { id: 'hotel', name: 'Hotel', icon: 'building' },
    ];
  }
}
