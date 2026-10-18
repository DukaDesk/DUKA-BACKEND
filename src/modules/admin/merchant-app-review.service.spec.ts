import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PublishingService } from '../publishing/publishing.service';
import { MerchantAppReviewService } from './merchant-app-review.service';

describe('MerchantAppReviewService', () => {
  let service: MerchantAppReviewService;
  let findFirst: jest.Mock;
  let tenantFindUnique: jest.Mock;
  let tenantUpdate: jest.Mock;
  let draftPageCount: jest.Mock;
  let draftPageFindMany: jest.Mock;
  let draftFindUnique: jest.Mock;
  let releaseFindMany: jest.Mock;
  let transaction: jest.Mock;
  let publishAsAdmin: jest.Mock;

  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue({ id: 'role-assignment' });
    tenantFindUnique = jest.fn();
    tenantUpdate = jest.fn();
    draftPageCount = jest.fn().mockResolvedValue(1);
    draftPageFindMany = jest.fn().mockResolvedValue([]);
    draftFindUnique = jest.fn().mockResolvedValue(null);
    releaseFindMany = jest.fn().mockResolvedValue([]);
    transaction = jest.fn().mockImplementation((operations) => Promise.all(operations));
    publishAsAdmin = jest.fn().mockResolvedValue({ version: '1.0.0', releaseId: 'release-1' });

    service = new MerchantAppReviewService(
      {
        userRole: { findFirst },
        tenant: { findUnique: tenantFindUnique, update: tenantUpdate },
        draftPage: { count: draftPageCount, findMany: draftPageFindMany },
        draft: { findUnique: draftFindUnique },
        release: { findMany: releaseFindMany },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: transaction,
      } as unknown as PrismaService,
      { publishAsAdmin } as unknown as PublishingService,
    );
  });

  it('allows an app reviewer to approve an in-review app before credential verification', async () => {
    tenantFindUnique.mockResolvedValueOnce({ id: 'tenant-1', verificationStatus: 'pending', appStatus: 'in_review' });
    tenantUpdate.mockResolvedValue({ id: 'tenant-1', appStatus: 'approved' });

    await expect(service.approveApp('tenant-1', 'admin-1')).resolves.toMatchObject({ appStatus: 'approved' });
    expect(publishAsAdmin).toHaveBeenCalledWith('tenant-1');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('does not allow app review access to users outside the selected platform roles', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.getReview('tenant-1', 'support-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });

  it('returns the submitted release versions with the review bundle', async () => {
    tenantFindUnique.mockResolvedValueOnce({ id: 'tenant-1', name: 'Shop', slug: 'shop', appStatus: 'in_review', appSubmittedAt: new Date() });
    draftPageFindMany.mockResolvedValueOnce([{ id: 'p1', name: 'Home', slug: 'home', isHome: true, sortOrder: 0, _count: { draftSections: 2 } }]);
    releaseFindMany.mockResolvedValueOnce([{ id: 'rel-1', version: '1.0.0', buildNumber: 1, status: 'pending_review', channel: 'production', publishedAt: null }]);

    const result = await service.getReview('tenant-1', 'admin-1');

    expect(result.releases).toEqual([
      { id: 'rel-1', version: '1.0.0', buildNumber: 1, status: 'pending_review', channel: 'production', publishedAt: null },
    ]);
    expect(result.draftPages).toHaveLength(1);
  });

  it('refuses approval while no submission is awaiting review', async () => {
    tenantFindUnique.mockResolvedValueOnce({ id: 'tenant-1', appStatus: 'none' });

    await expect(service.approveApp('tenant-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(publishAsAdmin).not.toHaveBeenCalled();
  });

  it('refuses approval when the in-review app has no submitted design', async () => {
    tenantFindUnique.mockResolvedValueOnce({ id: 'tenant-1', appStatus: 'in_review' });
    draftPageCount.mockResolvedValueOnce(0);

    await expect(service.approveApp('tenant-1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(publishAsAdmin).not.toHaveBeenCalled();
  });

  it('rejects an in-review app with a required reason and leaves it unpublished', async () => {
    tenantFindUnique.mockResolvedValueOnce({ id: 'tenant-1', appStatus: 'in_review' });
    tenantUpdate.mockResolvedValue({ id: 'tenant-1', appStatus: 'rejected' });

    await expect(service.rejectApp('tenant-1', 'admin-1', 'Fix checkout')).resolves.toMatchObject({ appStatus: 'rejected' });
    expect(publishAsAdmin).not.toHaveBeenCalled();

    tenantFindUnique.mockResolvedValueOnce({ id: 'tenant-1', appStatus: 'in_review' });
    await expect(service.rejectApp('tenant-1', 'admin-1', '  ')).rejects.toBeInstanceOf(BadRequestException);
  });
});
