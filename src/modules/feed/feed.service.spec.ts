import { BadRequestException } from '@nestjs/common';
import { FeedService } from './feed.service';

const prismaMock = {
  feedPost: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
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
      },
      select: expect.anything(),
    });
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
      expect.objectContaining({ data: { caption: null, ctaLabel: 'Buy Now' } }),
    );
  });
});
