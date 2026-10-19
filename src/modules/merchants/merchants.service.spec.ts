import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';

function makeService() {
  const prisma: any = {
    tenantUser: {
      findUnique: jest.fn().mockResolvedValue({ role: 'owner' }),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        verificationStatus: 'pending',
      }),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'tenant-1',
        ...data,
      })),
    },
  };
  const publishingService: any = {
    submitForReview: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    submitDraftsForReview: jest.fn().mockResolvedValue({ id: 'draft-1' }),
  };
  const service = new MerchantsService(prisma, {} as any, publishingService);
  return { service, prisma, publishingService };
}

describe('MerchantsService.submitAppReview', () => {
  it('queues an explicitly submitted app even while merchant verification is pending', async () => {
    const { service, prisma, publishingService } = makeService();
    const manifest = { screens: [{ id: 'home' }] };

    const result = await service.submitAppReview('tenant-1', 'owner-1', manifest);

    expect(publishingService.submitForReview).toHaveBeenCalledWith('tenant-1', 'owner-1', manifest);
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: expect.objectContaining({
        appStatus: 'in_review',
        appReviewNote: null,
      }),
    });
    expect(result).toMatchObject({ appStatus: 'in_review' });
  });

  it('stages the current drafts when no client manifest is supplied', async () => {
    const { service, publishingService } = makeService();

    const result = await service.submitAppReview('tenant-1', 'owner-1');

    expect(publishingService.submitDraftsForReview)
      .toHaveBeenCalledWith('tenant-1', 'owner-1');
    expect(publishingService.submitForReview).not.toHaveBeenCalled();
    expect(result).toMatchObject({ appStatus: 'in_review' });
  });

  it('legacy publish route stages drafts instead of failing', async () => {
    const { service, publishingService } = makeService();

    const result = await service.publish('tenant-1', 'owner-1');

    expect(publishingService.submitDraftsForReview)
      .toHaveBeenCalledWith('tenant-1', 'owner-1');
    expect(result).toMatchObject({ appStatus: 'in_review' });
  });

  it('still requires an owner or manager to submit an app', async () => {
    const { service, prisma, publishingService } = makeService();
    prisma.tenantUser.findUnique.mockResolvedValue(null);

    await expect(service.submitAppReview('tenant-1', 'not-an-owner', {}))
      .rejects.toThrow(ForbiddenException);
    expect(publishingService.submitForReview).not.toHaveBeenCalled();
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('rejects submissions for a missing merchant', async () => {
    const { service, prisma, publishingService } = makeService();
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.submitAppReview('missing-tenant', 'owner-1', {}))
      .rejects.toThrow(NotFoundException);
    expect(publishingService.submitForReview).not.toHaveBeenCalled();
  });
});
