import { ForbiddenException } from '@nestjs/common';
import { TenantDashboardBffService } from './tenant-dashboard-bff.service';

describe('TenantDashboardBffService tenant scope', () => {
  function createService(membership: { id: string } | null) {
    const prisma = {
      tenantUser: { findFirst: jest.fn().mockResolvedValue(membership) },
      page: { count: jest.fn().mockResolvedValue(2) },
      product: { count: jest.fn().mockResolvedValue(3) },
      order: { count: jest.fn().mockResolvedValue(4), findMany: jest.fn().mockResolvedValue([]) },
      booking: { count: jest.fn().mockResolvedValue(5), findMany: jest.fn().mockResolvedValue([]) },
      tenantPaymentAccount: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { service: new TenantDashboardBffService(prisma as never), prisma };
  }

  it('denies cross-tenant reads before querying tenant data', async () => {
    const { service, prisma } = createService(null);

    await expect(service.getDashboardSummary('user-1', 'tenant-2'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getAnalyticsSummary('user-1', 'tenant-2'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getIntegrationStatus('user-1', 'tenant-2'))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.tenantUser.findFirst).toHaveBeenCalledTimes(3);
    expect(prisma.page.count).not.toHaveBeenCalled();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.tenantPaymentAccount.findMany).not.toHaveBeenCalled();
  });

  it('returns tenant data for an active member only within the requested tenant', async () => {
    const { service, prisma } = createService({ id: 'membership-1' });

    await expect(service.getDashboardSummary('user-1', 'tenant-1')).resolves.toEqual({
      pages: 2,
      products: 3,
      orders: 4,
      bookings: 5,
    });
    expect(prisma.tenantUser.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', tenantId: 'tenant-1', status: 'active' },
      select: { id: true },
    });
    expect(prisma.page.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', isActive: true } });
  });
});
