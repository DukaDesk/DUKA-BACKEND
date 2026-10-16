import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PublishingService } from '../publishing/publishing.service';
import { MerchantAppReviewService } from './merchant-app-review.service';

describe('MerchantAppReviewService', () => {
  let service: MerchantAppReviewService;
  let findFirst: jest.Mock;
  let tenantFindUnique: jest.Mock;
  let tenantUpdate: jest.Mock;
  let draftPageCount: jest.Mock;
  let draftFindUnique: jest.Mock;
  let transaction: jest.Mock;
  let publishAsAdmin: jest.Mock;

  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue({ id: 'role-assignment' });
    tenantFindUnique = jest.fn();
    tenantUpdate = jest.fn();
    draftPageCount = jest.fn().mockResolvedValue(1);
    draftFindUnique = jest.fn().mockResolvedValue(null);
    transaction = jest.fn().mockImplementation((operations) => Promise.all(operations));
    publishAsAdmin = jest.fn().mockResolvedValue({ version: '1.0.0', releaseId: 'release-1' });

    service = new MerchantAppReviewService(
      {
        userRole: { findFirst },
        tenant: { findUnique: tenantFindUnique, update: tenantUpdate },
        draftPage: { count: draftPageCount },
        draft: { findUnique: draftFindUnique },
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
});
