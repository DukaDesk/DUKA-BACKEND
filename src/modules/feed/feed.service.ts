import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface FeedMediaRefLike {
  mediaId?: string;
  url: string;
  type: 'image' | 'video';
  posterUrl?: string;
}

/** Posts are deleted from the database this long after they were created. */
export const PROMO_LIFETIME_HOURS = 24;
/** Videos longer than this never reach a feed post. */
export const PROMO_VIDEO_MAX_SECONDS = 90;
/** Tenants without a subscription (Free) can post this many promos per UTC day. */
export const FREE_TIER_DAILY_PROMO_POSTS = 5;

const TENANT_ONSTORE_SELECT = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  publishedAt: true,
  activeReleaseId: true,
} as const;

const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  price: true,
  currency: true,
  images: { take: 1, orderBy: { sortOrder: 'asc' as const }, select: { url: true } },
} as const;

const POST_SELECT = {
  id: true,
  tenantId: true,
  caption: true,
  productId: true,
  ctaLabel: true,
  media: true,
  status: true,
  likeCount: true,
  shareCount: true,
  patronageCount: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  tenant: { select: TENANT_ONSTORE_SELECT },
  product: { select: PRODUCT_SELECT },
} as const;

/** Fields a merchant may set; keeps write paths from touching counters. */
export interface FeedPostWriteInput {
  caption?: string;
  productId?: string;
  ctaLabel?: string;
  media?: FeedMediaRefLike[];
  status?: 'published' | 'retired';
}

function validateMedia(media: FeedMediaRefLike[] | undefined | null) {
  if (!Array.isArray(media) || media.length === 0) {
    throw new BadRequestException('At least one image or one video is required');
  }
  if (media.length > 10) {
    throw new BadRequestException('A post can carry at most 10 media items');
  }
  const videos = media.filter(item => item?.type === 'video');
  if (videos.length > 1) {
    throw new BadRequestException('A post can carry at most one video');
  }
  for (const [index, item] of media.entries()) {
    if (!item || typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url)) {
      throw new BadRequestException(`media[${index}] must carry an http(s) url`);
    }
    if (item.type !== 'image' && item.type !== 'video') {
      throw new BadRequestException(`media[${index}].type must be "image" or "video"`);
    }
  }
  return media;
}

@Injectable()
export class FeedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedService.name);
  private purgeTimer?: ReturnType<typeof setInterval>;

  constructor(private prisma: PrismaService) {}

  /** Fans of the ephemeral feed never see leftovers if the timer stalls. */
  private notExpiredWhere() {
    return {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
  }

  onModuleInit() {
    // Purge expired posts on boot and every 5 minutes.
    this.purgeExpired().catch((err) => this.logger.warn(`Feed purge failed: ${err?.message}`));
    this.purgeTimer = setInterval(() => {
      this.purgeExpired().catch((err) => this.logger.warn(`Feed purge failed: ${err?.message}`));
    }, 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  /**
   * Delete promo posts older than their lifetime (24h). Likes cascade via
   * FK, so no manual cleanup is needed.
   */
  async purgeExpired() {
    const { count } = await this.prisma.feedPost.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return { count };
  }

  /** Resolve a tenant's tier key; "free" when no active subscription exists. */
  private async getTier(tenantId: string): Promise<{ tierSlug: string | null; dailyLimit: number }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    const active = subscription &&
      (subscription.status === 'active' || subscription.status === 'trial') &&
      (!subscription.endDate || subscription.endDate > new Date());
    if (!active || !subscription.plan) {
      return { tierSlug: active && subscription?.plan ? subscription.plan.slug : null, dailyLimit: FREE_TIER_DAILY_PROMO_POSTS };
    }
    const limits = (subscription.plan.limits ?? {}) as Record<string, unknown>;
    const configured = Number(limits?.dailyPromoPosts);
    return {
      tierSlug: subscription.plan.slug,
      dailyLimit: Number.isFinite(configured) && configured > 0 ? configured : FREE_TIER_DAILY_PROMO_POSTS,
    };
  }

  private startOfUtcDay(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  /** Quota + tier snapshot for the merchant composer. */
  async getQuota(tenantId: string) {
    const { tierSlug, dailyLimit } = await this.getTier(tenantId);
    const used = dailyLimit === Infinity
      ? await this.countPostsToday(tenantId)
      : Math.min(await this.countPostsToday(tenantId), dailyLimit);
    return {
      tier: tierSlug ?? 'free',
      limit: dailyLimit,
      used,
      remaining: dailyLimit === Infinity ? null : Math.max(0, dailyLimit - used),
    };
  }

  private countPostsToday(tenantId: string) {
    return this.prisma.feedPost.count({
      where: { tenantId, createdAt: { gte: this.startOfUtcDay(new Date()) } },
    });
  }

  private async assertDailyQuota(tenantId: string) {
    const { tierSlug, dailyLimit } = await this.getTier(tenantId);
    if (dailyLimit === Infinity) return;
    const used = await this.countPostsToday(tenantId);
    if (used >= dailyLimit) {
      throw new ForbiddenException(
        `Daily promo limit reached (${used}/${dailyLimit}${tierSlug ? ` on ${tierSlug}` : ' today'}) — your promos from today stay up, more slots unlock tomorrow`,
      );
    }
  }

  /** Merchant dashboard: create a promo post. Platform-owned posts (admin
   * promos) pass `{ skipQuota: true }` — quotas meter merchants, not the platform. */
  async createPost(tenantId: string, input: CreateFeedPostInput, opts?: { skipQuota?: boolean }) {
    const media = validateMedia(input.media);
    await this.assertProductBelongsToTenant(tenantId, input.productId);
    if (!opts?.skipQuota) await this.assertDailyQuota(tenantId);

    return this.prisma.feedPost.create({
      data: {
        tenantId,
        caption: input.caption?.trim() || null,
        productId: input.productId ?? null,
        ctaLabel: input.ctaLabel?.trim() || 'Buy Now',
        media: media.map(item => ({
          mediaId: item.mediaId ?? null,
          url: item.url,
          type: item.type,
          posterUrl: item.posterUrl ?? null,
        })),
        expiresAt: new Date(Date.now() + PROMO_LIFETIME_HOURS * 60 * 60 * 1000),
      },
      select: POST_SELECT as any,
    });
  }

  /** Merchant dashboard: edit own post (contents only — counters are read-only to merchants). */
  async updatePost(postId: string, tenantId: string, input: FeedPostWriteInput) {
    const existing = await this.prisma.feedPost.findFirst({ where: { id: postId, tenantId } });
    if (!existing) throw new NotFoundException('Post not found');

    const data: any = {};
    if (input.caption !== undefined) data.caption = input.caption?.trim() || null;
    if (input.ctaLabel !== undefined) data.ctaLabel = input.ctaLabel?.trim() || 'Buy Now';
    if (input.status !== undefined) data.status = input.status;
    if (input.productId !== undefined) {
      await this.assertProductBelongsToTenant(tenantId, input.productId);
      data.productId = input.productId;
    }
    if (input.media !== undefined) data.media = validateMedia(input.media);

    return this.prisma.feedPost.update({
      where: { id: postId },
      data,
      select: POST_SELECT as any,
    });
  }

  /** Merchant dashboard: hard-delete a post (likes cascade with it). */
  async deletePost(postId: string, tenantId: string) {
    const existing = await this.prisma.feedPost.findFirst({ where: { id: postId, tenantId } });
    if (!existing) throw new NotFoundException('Post not found');
    await this.prisma.feedPost.delete({ where: { id: postId } });
    return { id: postId, deleted: true };
  }

  async listPosts(tenantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.feedPost.findMany({
        where: { tenantId },
        select: POST_SELECT as any,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.feedPost.count({ where: { tenantId } }),
    ]);
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /** One post for the public promo screen; tenant must be publicly live. */
  async getPublicPost(postId: string) {
    const post = await this.prisma.feedPost.findFirst({
      where: {
        id: postId,
        status: 'published',
        ...this.notExpiredWhere(),
        tenant: { status: 'published', activeReleaseId: { not: null } },
      },
      select: POST_SELECT as any,
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async assertProductBelongsToTenant(tenantId: string, productId?: string) {
    if (!productId) return;
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) {
      throw new BadRequestException('productId does not belong to this tenant — the promo button always opens the merchant own product');
    }
  }
}

export interface CreateFeedPostInput {
  caption?: string;
  productId?: string;
  ctaLabel?: string;
  media?: FeedMediaRefLike[];
}
