import { BadRequestException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';

describe('PlatformAdminService subscriptions', () => {
  it('applies allow-listed search, filters, sort, and bounded pagination', async () => {
    const prisma = {
      subscription: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(45),
      },
    };
    const service = new PlatformAdminService(prisma as never);

    const result = await service.getAllSubscriptions(2, 1000, {
      status: 'active',
      plan: 'enterprise',
      search: '  dukadesk  ',
      sort: 'merchantName',
      order: 'asc',
    });

    const where = {
      status: 'active',
      plan: { slug: 'enterprise' },
      OR: [
        { tenant: { name: { contains: 'dukadesk', mode: 'insensitive' } } },
        { tenant: { email: { contains: 'dukadesk', mode: 'insensitive' } } },
        { plan: { name: { contains: 'dukadesk', mode: 'insensitive' } } },
        { plan: { slug: { contains: 'dukadesk', mode: 'insensitive' } } },
      ],
    };
    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      where,
      include: { tenant: true, plan: true },
      orderBy: { tenant: { name: 'asc' } },
      skip: 100,
      take: 100,
    });
    expect(prisma.subscription.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({ data: [], total: 45, page: 2, limit: 100, totalPages: 1 });
  });

  it('ignores unsupported sort keys and clamps invalid pagination', async () => {
    const prisma = {
      subscription: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new PlatformAdminService(prisma as never);

    const result = await service.getAllSubscriptions(-1, 0, { sort: 'unsafeField' });

    expect(prisma.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    }));
    expect(result).toMatchObject({ page: 1, limit: 20, totalPages: 0 });
  });

  it('updates only supported subscription fields with normalized values', async () => {
    const prisma = {
      subscription: {
        update: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      },
    };
    const service = new PlatformAdminService(prisma as never);

    await service.updateSubscription('sub-1', {
      planId: 'plan-2',
      status: 'CANCELED',
      endDate: '2025-01-31T00:00:00.000Z',
      autoRenew: false,
    });

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: {
        planId: 'plan-2',
        status: 'canceled',
        endDate: new Date('2025-01-31T00:00:00.000Z'),
        autoRenew: false,
      },
    });
  });

  it('rejects unsupported subscription update values before database access', async () => {
    const prisma = { subscription: { update: jest.fn() } };
    const service = new PlatformAdminService(prisma as never);

    await expect(service.updateSubscription('sub-1', { status: 'delete' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateSubscription('sub-1', { autoRenew: 'false' as never }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});
