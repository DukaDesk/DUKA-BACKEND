import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FeedService } from './feed.service';

const prismaMock = {
  feedPost: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  product: {
    findFirst: jest.fn(),
  },
  subscription: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
};

const feed = new FeedService(prismaMock as any);

const media = [{ url: 'https://cdn.example.test/a.jpg', type: 'image' as const }];

describe('FeedService (merchant self-service)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a post with defaults and normalized media refs', async () => {
    prismaMock.feedPost.create.mockResolvedValue({ id: 'post-1' });
    await feed.createPost('tenant-1', { media, caption: '  Sale day  ' });
    expect(prismaMock.feedPost.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        caption: 'Sale day',
        productId: null,
        ctaLabel: 'Buy Now',
        media: [{ mediaId: null, url: 'https://cdn.example.test/a.jpg', type: 'image', posterUrl: null }],
        expiresAt: expect.any(Date),
      },
      select: expect.anything(),
    });
    const created = prismaMock.feedPost.create.mock.calls[0][0];
    expect(Number(created.data.expiresAt) - Number(new Date())).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(Number(created.data.expiresAt) - Number(new Date())).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('rejects posts without media and posts with more than one video', async () => {
    await expect(feed.createPost('tenant-1', { media: [] } as any)).rejects.toThrow(BadRequestException);
    await expect(
      feed.createPost('tenant-1', { media: [
        { url: 'https://cdn.example.test/a.mp4', type: 'video' },
        { url: 'https://cdn.example.test/b.mp4', type: 'video' },
      ] } as any),
    ).rejects.toThrow('at most one video');
  });

  it('rejects media entries without an http(s) url', async () => {
    await expect(
      feed.createPost('tenant-1', { media: [{ url: 'not-a-url', type: 'image' } as any] } as any),
    ).rejects.toThrow('must carry an http(s) url');
  });

  it('refuses products that belong to another tenant', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    await expect(
      feed.createPost('tenant-1', { media, productId: 'other-tenant-product' } as any),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.feedPost.create).not.toHaveBeenCalled();
  });

  it('is scoped to the tenant for update/delete', async () => {
    prismaMock.feedPost.findFirst.mockResolvedValue(null);
    await expect(feed.updatePost('post-1', 'tenant-1', { ctaLabel: 'Order Now' })).rejects.toThrow('not found');
    await expect(feed.deletePost('post-1', 'tenant-1')).rejects.toThrow('not found');
    expect(prismaMock.feedPost.update).not.toHaveBeenCalled();
    expect(prismaMock.feedPost.delete).not.toHaveBeenCalled();
  });

  it('normalizes empty ctaLabel/caption on updates', async () => {
    prismaMock.feedPost.findFirst.mockResolvedValue({ id: 'post-1' });
    prismaMock.feedPost.update.mockResolvedValue({ id: 'post-1' });
    await feed.updatePost('post-1', 'tenant-1', { caption: '   ', ctaLabel: '  ' });
    expect(prismaMock.feedPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { caption: null, ctaLabel: '' } }),
    );
  });

  it('enforces the free-tier daily quota of 5 posts', async () => {
    prismaMock.feedPost.count.mockResolvedValue(5);
    await expect(feed.createPost('tenant-1', { media } as any)).rejects.toThrow(ForbiddenException);
    expect(prismaMock.feedPost.create).not.toHaveBeenCalled();

    prismaMock.feedPost.count.mockResolvedValue(4);
    prismaMock.feedPost.create.mockResolvedValue({ id: 'post-2' });
    await expect(feed.createPost('tenant-1', { media } as any)).resolves.toMatchObject({ id: 'post-2' });
  });

  it('uses the subscribed plan\'s dailyPromoPosts limit when set', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      status: 'active',
      endDate: null,
      plan: { slug: 'growth', limits: { dailyPromoPosts: 20 } },
    });
    prismaMock.feedPost.count.mockResolvedValue(0);
    await expect(feed.getQuota('tenant-1')).resolves.toMatchObject({ tier: 'growth', limit: 20, remaining: 20 });
    prismaMock.feedPost.count.mockResolvedValue(20);
    await expect(feed.createPost('tenant-1', { media } as any)).rejects.toThrow('20/20 on growth');
  });

  it('counts posts across the whole UTC day for the quota', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.feedPost.count.mockResolvedValue(2);
    const quota = await feed.getQuota('tenant-1');
    expect(quota).toMatchObject({ tier: 'free', limit: 5, used: 2, remaining: 3 });
    const where = prismaMock.feedPost.count.mock.calls[0][0].where;
    const lowerBound = where.createdAt.gte as Date;
    expect(lowerBound.getUTCMinutes()).toBe(0);
    expect(lowerBound.toISOString().endsWith('00:00.000Z')).toBe(true);
  });

  it('purges expired posts and their cascading likes', async () => {
    prismaMock.feedPost.deleteMany.mockResolvedValue({ count: 3 });
    await expect(feed.purgeExpired()).resolves.toMatchObject({ count: 3 });
    expect(prismaMock.feedPost.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});
