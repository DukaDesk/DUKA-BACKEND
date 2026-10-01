import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

const ADMIN_ID = 'admin-1';
const TENANT_ID = 'tenant-1';

function makePrisma(overrides: any = {}) {
  const tenantRow = {
    id: TENANT_ID,
    verificationStatus: 'pending',
    appStatus: 'none',
    ...overrides.tenant,
  };
  const updatedRow = { ...tenantRow, ...overrides.updated };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: ADMIN_ID }) },
    userRole: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-role' }) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(tenantRow),
      // Merge the update payload like a real database would.
      update: jest.fn(async (args: any) => ({ ...tenantRow, ...args.data })),
    },
    kycSubmission: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(overrides.pendingKyc ?? 1),
    },
    draftPage: { count: jest.fn().mockResolvedValue(overrides.drafts ?? 2) },
    auditLog: { create: jest.fn().mockImplementation(async (args: any) => ({ id: 'audit-1', ...args.data })) },
    // Execute the ops in order so array-index destructuring in the service
    // resolves to the same positions as a real $transaction.
    $transaction: jest.fn(async (ops: Promise<any>[]) => Promise.all(ops)),
  };
  return { prisma, tenantRow, updatedRow };
}

function makeService(prisma: any, publishing: any = {}) {
  const publishingService = { publishAsAdmin: jest.fn().mockResolvedValue({ version: '1.0.0', releaseId: 'rel-1', checksum: 'abc' }), ...publishing };
  return {
    service: new AdminService(prisma, publishingService as any, {} as any),
    publishingService,
  };
}

describe('AdminService two-stage approval', () => {
  describe('verifyMerchant', () => {
    it('returns the existing tenant without side effects when already verified', async () => {
      const { prisma, tenantRow } = makePrisma({ tenant: { verificationStatus: 'verified' } });
      const { service } = makeService(prisma);
      const result = await service.verifyMerchant(TENANT_ID, ADMIN_ID);
      expect(result).toEqual(tenantRow);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects verification when rejected and no pending KYC', async () => {
      const { prisma } = makePrisma({ tenant: { verificationStatus: 'rejected' }, pendingKyc: 0 });
      const { service } = makeService(prisma);
      await expect(service.verifyMerchant(TENANT_ID, ADMIN_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows re-verification when a pending KYC resubmission exists', async () => {
      const { prisma } = makePrisma({ tenant: { verificationStatus: 'rejected' }, pendingKyc: 2 });
      const { service } = makeService(prisma);
      const result = await service.verifyMerchant(TENANT_ID, ADMIN_ID);
      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TENANT_ID }, data: expect.objectContaining({ verificationStatus: 'verified' }) }),
      );
      expect(result).toMatchObject({ id: TENANT_ID, verificationStatus: 'verified' });
    });

    it('rejects a pending merchant when no compliance submission exists', async () => {
      const { prisma } = makePrisma({ pendingKyc: 0 });
      const { service } = makeService(prisma);
      await expect(service.verifyMerchant(TENANT_ID, ADMIN_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects users without a platform admin role', async () => {
      const { prisma } = makePrisma();
      prisma.userRole.findFirst.mockResolvedValue(null);
      const { service } = makeService(prisma);
      await expect(service.verifyMerchant(TENANT_ID, ADMIN_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('resolves the tenant update (index 1), not the audit row (index 2)', async () => {
      const { prisma } = makePrisma();
      const { service } = makeService(prisma);
      const result: any = await service.verifyMerchant(TENANT_ID, ADMIN_ID);
      expect(result.verificationStatus).toBe('verified');
      expect(result.action).toBeUndefined();
    });

    it('throws NotFoundException for unknown tenant', async () => {
      const { prisma } = makePrisma();
      prisma.tenant.findUnique.mockResolvedValueOnce(null);
      const { service } = makeService(prisma);
      await expect(service.verifyMerchant('missing', ADMIN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('rejectCredentials', () => {
    it('returns the existing tenant when already rejected with no pending KYC', async () => {
      const { prisma, tenantRow } = makePrisma({ tenant: { verificationStatus: 'rejected' }, pendingKyc: 0 });
      const { service } = makeService(prisma);
      const result = await service.rejectCredentials(TENANT_ID, ADMIN_ID, 'bad docs');
      expect(result).toEqual(tenantRow);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('requires a non-empty reason', async () => {
      const { prisma } = makePrisma();
      const { service } = makeService(prisma);
      await expect(service.rejectCredentials(TENANT_ID, ADMIN_ID, '   ')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes the trimmed reason and returns the updated tenant', async () => {
      const { prisma } = makePrisma();
      const { service } = makeService(prisma);
      const result = await service.rejectCredentials(TENANT_ID, ADMIN_ID, '  incomplete  ');
      expect(prisma.kycSubmission.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reviewNote: 'incomplete' }) }),
      );
      expect(result).toMatchObject({ id: TENANT_ID, verificationStatus: 'rejected' });
    });
  });

  describe('approveApp', () => {
    it('returns the existing tenant when already approved without publishing', async () => {
      const { prisma, tenantRow } = makePrisma({ tenant: { verificationStatus: 'verified', appStatus: 'approved' } });
      const { service, publishingService } = makeService(prisma);
      const result = await service.approveApp(TENANT_ID, ADMIN_ID);
      expect(result).toEqual(tenantRow);
      expect(publishingService.publishAsAdmin).not.toHaveBeenCalled();
    });

    it('rejects unverified merchants with Forbidden', async () => {
      const { prisma } = makePrisma({ tenant: { verificationStatus: 'pending', appStatus: 'in_review' } });
      const { service, publishingService } = makeService(prisma);
      await expect(service.approveApp(TENANT_ID, ADMIN_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(publishingService.publishAsAdmin).not.toHaveBeenCalled();
    });

    it('rejects with BadRequest when no draft content exists', async () => {
      const { prisma } = makePrisma({ tenant: { verificationStatus: 'verified', appStatus: 'in_review' }, drafts: 0 });
      const { service, publishingService } = makeService(prisma);
      await expect(service.approveApp(TENANT_ID, ADMIN_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(publishingService.publishAsAdmin).not.toHaveBeenCalled();
    });

    it('rejects an app that has not been submitted for review', async () => {
      const { prisma } = makePrisma({ tenant: { verificationStatus: 'verified', appStatus: 'none' } });
      const { service, publishingService } = makeService(prisma);
      await expect(service.approveApp(TENANT_ID, ADMIN_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(publishingService.publishAsAdmin).not.toHaveBeenCalled();
    });

    it('publishes then returns the tenant update (index 0), not the audit row', async () => {
      const { prisma } = makePrisma({ tenant: { verificationStatus: 'verified', appStatus: 'in_review' } });
      const { service, publishingService } = makeService(prisma);
      const result: any = await service.approveApp(TENANT_ID, ADMIN_ID);
      expect(publishingService.publishAsAdmin).toHaveBeenCalledWith(TENANT_ID);
      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ appStatus: 'approved' }) }),
      );
      expect(result.appStatus).toBe('approved');
      expect(result.action).toBeUndefined();
    });
  });

  describe('rejectApp', () => {
    it('returns the existing tenant when already rejected', async () => {
      const { prisma, tenantRow } = makePrisma({ tenant: { verificationStatus: 'verified', appStatus: 'rejected' } });
      const { service } = makeService(prisma);
      const result = await service.rejectApp(TENANT_ID, ADMIN_ID, 'bad design');
      expect(result).toEqual(tenantRow);
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('requires a non-empty reason and returns the updated tenant', async () => {
      const { prisma } = makePrisma({ tenant: { verificationStatus: 'verified', appStatus: 'in_review' } });
      const { service } = makeService(prisma);
      await expect(service.rejectApp(TENANT_ID, ADMIN_ID, '')).rejects.toBeInstanceOf(BadRequestException);
      const result = await service.rejectApp(TENANT_ID, ADMIN_ID, '  off-brand  ');
      expect(result).toMatchObject({ id: TENANT_ID, appStatus: 'rejected' });
      expect(result.appReviewNote).toBe('off-brand');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ metadata: { reason: 'off-brand' } }) }),
      );
    });
  });
});
