import { NotFoundException } from '@nestjs/common';
import { AdminPromoPostsController } from './admin-promo-posts.controller';

describe('AdminPromoPostsController', () => {
  const commsMock = { getPlatformTenantId: jest.fn().mockResolvedValue('platform-tenant') };
  const feedMock = {
    createPost: jest.fn().mockResolvedValue({ id: 'post-1' }),
    listPosts: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    deletePost: jest.fn().mockResolvedValue({ deleted: true }),
  };
  const prismaMock = { feedPost: { findUnique: jest.fn() } };
  const controller = new AdminPromoPostsController(commsMock as any, feedMock as any, prismaMock as any);

  beforeEach(() => jest.clearAllMocks());
  commsMock.getPlatformTenantId.mockResolvedValue('platform-tenant');

  it('creates platform posts without touching the merchant quota', async () => {
    await controller.create({ caption: 'Big sale', media: [{ url: 'https://cdn/a.jpg', type: 'image' }] });
    expect(feedMock.createPost).toHaveBeenCalledWith(
      'platform-tenant',
      expect.objectContaining({ caption: 'Big sale' }),
      { skipQuota: true },
    );
  });

  it('only retracts platform-owned posts', async () => {
    prismaMock.feedPost.findUnique.mockResolvedValue({ tenantId: 'merchant-7' });
    await expect(controller.remove('post-9')).rejects.toThrow(NotFoundException);
    prismaMock.feedPost.findUnique.mockResolvedValue({ tenantId: 'platform-tenant' });
    await expect(controller.remove('post-9')).resolves.toMatchObject({ deleted: true });
    expect(feedMock.deletePost).toHaveBeenCalledWith('post-9', 'platform-tenant');
  });
});
