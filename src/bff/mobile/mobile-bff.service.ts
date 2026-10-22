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

  // ─── Promo feed (public) ─────────────────────────────────────────
  // Only posts whose tenant is publicly live (published + active release)
  // and whose own status is published are served. Merchants never receive
  // actor identities — only aggregate counts live on the post rows.

  private static readonly FEED_POST_SELECT = {
    id: true,
    tenantId: true,
    caption: true,
    productId: true,
    ctaLabel: true,
    media: true,
    likeCount: true,
    shareCount: true,
    patronageCount: true,
    createdAt: true,
    tenant: {
      select: { id: true, name: true, slug: true, logo: true },
    },
    product: {
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        currency: true,
        images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } },
      },
    },
  } as const;

  private privateizeFeedPost(post: any, actorId?: string) {
    return {
      ...post,
      likedByMe: actorId ? post.likes?.length > 0 : false,
      likes: undefined,
    };
  }

  async getFeedPosts(page: string | undefined, limit: string | undefined, actorId?: string) {
    const pageNum = parseInt(page || '1', 10) || 1;
    const limitNum = Math.min(parseInt(limit || '10', 10) || 10, 30);
    const where = {
      status: 'published' as const,
      // Posts are ephemeral — hide any that out-lived their 24h window even
      // if the purge sweep has not run yet.
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      tenant: { status: 'published' as const, activeReleaseId: { not: null } },
    };
    const [rows, total] = await Promise.all([
      this.prisma.feedPost.findMany({
        where,
        select: { ...MobileBffService.FEED_POST_SELECT, likes: {
          select: { actorId: true },
          where: actorId ? { actorId } : { id: { equals: '__none__' } },
        } },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.feedPost.count({ where }),
    ]);
    return {
      data: rows.map(row => this.privateizeFeedPost(row, actorId)),
      meta: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    };
  }

  async getFeedPost(postId: string, actorId?: string) {
    const post = await this.prisma.feedPost.findFirst({
      where: {
        id: postId,
        status: 'published',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        tenant: { status: 'published', activeReleaseId: { not: null } },
      },
      select: { ...MobileBffService.FEED_POST_SELECT, likes: {
        select: { actorId: true },
        where: actorId ? { actorId } : { id: { equals: '__none__' } },
      } },
    });
    if (!post) {
      throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post not found' });
    }
    return this.privateizeFeedPost(post, actorId);
  }

  // ─── Platform comms inbox (public broadcasts + direct to the actor) ──
  // Same actor rule as the feed: signed-in app users key receipts on their
  // userId; anonymous devices key on the persistent device actor key.

  private inboxWhereFor(actorId: string, userId?: string) {
    const channel: any[] = [
      { kind: 'broadcast', audience: { in: ['mobile', 'both'] } },
    ];
    if (userId) channel.push({ kind: 'direct', recipientUserId: userId });
    if (actorId) channel.push({ kind: 'direct', recipientActorId: actorId });
    return { OR: channel };
  }

  async getInbox(page: string | undefined, limit: string | undefined, actorId: string, userId?: string) {
    const pageNum = parseInt(page || '1', 10) || 1;
    const limitNum = Math.min(parseInt(limit || '20', 10) || 20, 50);
    const where = this.inboxWhereFor(actorId, userId);
    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        select: {
          id: true, kind: true, audience: true, title: true, body: true,
          media: true, createdAt: true,
          reads: { where: { actorId }, select: { readAt: true } },
        },
      }),
      this.prisma.announcement.count({ where }),
    ]);
    const data = rows.map((row: any) => ({
      id: row.id,
      kind: row.kind,
      audience: row.audience,
      title: row.title,
      body: row.body,
      media: row.media ?? [],
      createdAt: row.createdAt,
      readAt: row.reads?.[0]?.readAt ?? null,
      unread: row.reads?.length === 0,
    }));
    return { data, meta: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }, unread: data.filter(item => item.unread).length };
  }

  async markInboxRead(announcementId: string, actorId: string) {
    const existing = await this.prisma.announcementRead.findFirst({
      where: { announcementId, actorId },
      select: { id: true, readAt: true },
    });
    if (existing) return { id: existing.id, readAt: existing.readAt, alreadyRead: true };
    const read = await this.prisma.announcementRead.create({
      data: { announcementId, actorId },
      select: { id: true, readAt: true },
    });
    return { id: read.id, readAt: read.readAt, alreadyRead: false };
  }

  /** Toggle a like. Logged-in actors dedupe by userId; anonymous by device key. */
  async toggleFeedLike(postId: string, actorId?: string, userId?: string) {
    if (!actorId) {
      const [, current] = await this.prisma.$transaction([
        this.prisma.feedLike.findUnique({ where: { postId_actorId: { postId, actorId: '__noop__' } } }),
        this.prisma.feedPost.findUniqueOrThrow({
          where: { id: postId },
          select: { likeCount: true, tenantId: true },
        }),
      ]);
      return { liked: false, likeCount: (current as any)?.likeCount };
    }
    const existing = await this.prisma.feedLike.findUnique({
      where: { postId_actorId: { postId, actorId } },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.feedLike.delete({ where: { id: existing.id } }),
        this.prisma.feedPost.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } }),
      ]);
      const { likeCount } = await this.prisma.feedPost.findUniqueOrThrow({
        where: { id: postId },
        select: { likeCount: true },
      });
      return { liked: false, likeCount };
    }
    if (!userId) {
      // Anonymous actor — validate the referenced post exists and is publicly live
      // so we never hold likes on retired/unpublished content.
      await this.getFeedPost(postId);
    }
    try {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.feedLike.create({ data: { postId, actorId, userId } }),
        this.prisma.feedPost.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        }),
      ]);
      return { liked: true, likeCount: updated.likeCount };
    } catch {
      // Concurrent duplicate like — treat as a no-op success.
      const { likeCount } = await this.prisma.feedPost.findUniqueOrThrow({
        where: { id: postId },
        select: { likeCount: true },
      });
      return { liked: true, likeCount };
    }
  }

  async markFeedShare(postId: string, userId?: string) {
    await this.getFeedPost(postId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const post = await tx.feedPost.update({
        where: { id: postId },
        data: { shareCount: { increment: 1 } },
        select: { shareCount: true, tenantId: true },
      });
      await tx.analyticsEvent.create({
        data: {
          tenantId: post.tenantId,
          userId,
          event: 'feed_share',
          category: 'feed',
          label: postId,
          properties: { postId },
          timestamp: new Date(),
        },
      });
      return post;
    });
    return { shareCount: (updated as any).shareCount };
  }

  /**
   * Patronage CTA — the only sanctioned "open merchant app" resolver for a
   * post. Returns tenant/product targets for the shell deep-open while
   * recording the engagement.
   */
  async trackFeedCta(postId: string, userId?: string) {
    const post = await this.getFeedPost(postId);
    await this.prisma.$transaction(async (tx) => {
      await tx.feedPost.update({
        where: { id: postId },
        data: { patronageCount: { increment: 1 } },
      });
      await tx.analyticsEvent.create({
        data: {
          tenantId: post.tenantId,
          userId,
          event: 'feed_cta',
          category: 'feed',
          label: postId,
          properties: { postId, productId: post.productId },
          timestamp: new Date(),
        },
      });
    });
    return {
      tenantId: post.tenantId,
      tenantSlug: post.tenant?.slug ?? null,
      productId: post.productId ?? null,
    };
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
