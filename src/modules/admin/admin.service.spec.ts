import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';

function makeService() {
  const tx: any = {
    release: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    tenant: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    userRole: { findFirst: jest.fn().mockResolvedValue({ id: 'role-1' }) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        slug: 'shop',
        status: 'draft',
        activeReleaseId: null,
        releases: [{ id: 'candidate-1', version: '2.0.0', status: 'pending_review' }],
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    release: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'candidate-1',
        version: '2.0.0',
        status: 'pending_review',
        channel: 'production',
        manifest: { manifestVersion: '1.0.0' },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (callback: (client: any) => Promise<any>) => callback(tx)),
  };
  const releases: any = { invalidate: jest.fn().mockResolvedValue(undefined) };
  return { service: new AdminService(prisma, releases), prisma, releases, tx };
}

describe('AdminService app review', () => {
  it('restricts app review to platform reviewers', async () => {
    const { service, prisma } = makeService();
    prisma.userRole.findFirst.mockResolvedValue(null);

    await expect(service.getMerchantAppReview('tenant-1', 'merchant-user')).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('exposes the pending candidate for review without reading the live release', async () => {
    const { service } = makeService();
    const result = await service.getMerchantAppReview('tenant-1', 'admin-user');

    expect(result).toMatchObject({ appStatus: 'in_review', tenant: { id: 'tenant-1', appStatus: 'in_review' } });
    expect(result.releases[0]).toMatchObject({ id: 'candidate-1', status: 'pending_review' });
  });

  it('promotes the exact pending release only after reviewer approval', async () => {
    const { service, prisma, releases, tx } = makeService();
    const result = await service.approveMerchantApp('tenant-1', 'admin-user');

    expect(result).toMatchObject({ status: 'published', releaseId: 'candidate-1', version: '2.0.0' });
    expect(tx.release.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', status: 'published', channel: 'production' },
      data: { status: 'superseded' },
    }));
    expect(tx.release.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'candidate-1', status: 'pending_review' },
      data: expect.objectContaining({ status: 'published', channel: 'production' }),
    }));
    expect(tx.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tenant-1' },
      data: expect.objectContaining({ activeReleaseId: 'candidate-1', status: 'published' }),
    }));
    expect(prisma.tenant.update).not.toHaveBeenCalled();
    expect(releases.invalidate).toHaveBeenCalledWith('tenant-1', 'shop');
  });

  it('rejects the candidate without changing the current active release', async () => {
    const { service, prisma } = makeService();
    await service.rejectMerchantApp('tenant-1', 'admin-user', 'Fix checkout links');

    expect(prisma.release.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'candidate-1', status: 'pending_review' },
      data: { status: 'rejected', releaseNotes: 'Fix checkout links' },
    }));
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});
