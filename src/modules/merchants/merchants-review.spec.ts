import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';

function setup(tenant: any = { id: 't1', verificationStatus: 'pending' }, role: string | null = 'owner') {
  const prisma: any = {
    tenantUser: { findUnique: jest.fn().mockResolvedValue(role ? { tenantId: 't1', userId: 'u1', role } : null) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(tenant),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 't1', ...data })),
    },
  };
  const service = new MerchantsService(prisma, {} as any);
  return { prisma, service };
}

describe('submitAppReview', () => {
  it('never rejects an unverified merchant — review queues regardless of verification', async () => {
    const { service, prisma } = setup({ id: 't1', verificationStatus: 'pending' });
    const result: any = await service.submitAppReview('t1', 'u1');
    expect(result.appStatus).toBe('in_review');
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' }, data: expect.objectContaining({ appStatus: 'in_review' }) }),
    );
  });

  it('still requires merchant membership', async () => {
    const { service } = setup({ id: 't1', verificationStatus: 'verified' }, null);
    await expect(service.submitAppReview('t1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s for an unknown merchant', async () => {
    const { service } = setup(null);
    await expect(service.submitAppReview('t1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});