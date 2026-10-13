import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

function makeService() {
  const tx: any = {
    tenant: { update: jest.fn(async (args: any) => ({ id: 'tenant-1', ...args.data })) },
  };
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ id: 'admin-user' })) },
    userRole: { findFirst: jest.fn(async () => ({ id: 'role-1' })) },
    tenant: {
      findUnique: jest.fn(async () => ({
        id: 'tenant-1',
        slug: 'shop',
        status: 'draft',
        verificationStatus: 'verified',
        appStatus: 'in_review',
        activeReleaseId: null,
      })),
      update: jest.fn(async (args: any) => ({ id: 'tenant-1', ...args.data })),
    },
    draftPage: { count: jest.fn(async () => 1) },
    draft: { findUnique: jest.fn(async () => null) },
    auditLog: { create: jest.fn(async (args: any) => ({ id: 'audit-1', ...args.data })) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const publishingService: any = {
    publishAsAdmin: jest.fn(async () => ({ version: '2.0.0', releaseId: 'candidate-1' })),
  };
  const livePreviewService: any = {
    previewTenant: jest.fn(async () => ({ tenantId: 'tenant-1', preview: true })),
  };
  const mediaService: any = { createComplianceDocumentLinks: jest.fn(async () => []) };
  const service = new AdminService(prisma, publishingService, livePreviewService, mediaService);
  return { service, prisma, publishingService, livePreviewService, tx };
}

describe('AdminService app review (two-stage)', () => {
  it('restricts review actions to platform reviewers', async () => {
    const { service, prisma } = makeService();
    prisma.userRole.findFirst.mockResolvedValue(null);

    await expect(service.getMerchantPreview('tenant-1', 'merchant-user')).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('rejects review for unknown users', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getMerchantPreview('tenant-1', 'ghost')).rejects.toThrow(NotFoundException);
  });

  it('exposes the draft live-preview without publishing anything', async () => {
    const { service, livePreviewService } = makeService();
    const result = await service.getMerchantPreview('tenant-1', 'admin-user');

    expect(result).toEqual({ tenantId: 'tenant-1', preview: true });
    expect(livePreviewService.previewTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('approves a verified in-review app via the admin bypass and records the audit trail', async () => {
    const { service, prisma, publishingService } = makeService();
    const result = await service.approveApp('tenant-1', 'admin-user');

    expect(publishingService.publishAsAdmin).toHaveBeenCalledWith('tenant-1');
    expect(prisma.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tenant-1' },
      data: expect.objectContaining({ appStatus: 'approved' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'merchant.app_approve' }),
    }));
    expect(result).toMatchObject({ id: 'tenant-1', appStatus: 'approved' });
  });

  it('refuses approval until stage-1 verification is complete', async () => {
    const { service, prisma } = makeService();
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', verificationStatus: 'pending', appStatus: 'in_review' });

    await expect(service.approveApp('tenant-1', 'admin-user')).rejects.toThrow(/verification/i);
  });

  it('rejects the candidate with a reason and without publishing', async () => {
    const { service, prisma, publishingService } = makeService();
    const result = await service.rejectApp('tenant-1', 'admin-user', 'Fix checkout links');

    expect(publishingService.publishAsAdmin).not.toHaveBeenCalled();
    expect(prisma.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tenant-1' },
      data: expect.objectContaining({ appStatus: 'rejected', appReviewNote: 'Fix checkout links' }),
    }));
    expect(result).toMatchObject({ appStatus: 'rejected' });
  });

  it('requires a rejection reason', async () => {
    const { service } = makeService();
    await expect(service.rejectApp('tenant-1', 'admin-user', '  ')).rejects.toThrow(/reason/i);
  });
});
