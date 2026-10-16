import { BusinessDashboardBffService } from './business-dashboard-bff.service';

function makeService() {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      count: jest.fn()
        .mockResolvedValueOnce(82)
        .mockResolvedValueOnce(4),
    },
    userRole: { findFirst: jest.fn().mockResolvedValue({ id: 'role-1' }) },
    tenant: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    product: { count: jest.fn().mockResolvedValue(0) },
    order: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { total: null } }),
    },
  };
  return { service: new BusinessDashboardBffService(prisma), prisma };
}

describe('BusinessDashboardBffService platform overview', () => {
  it('reports unique platform-role users separately from all users', async () => {
    const { service, prisma } = makeService();

    const overview = await service.getPlatformOverview();

    expect(prisma.user.count.mock.calls[0]).toEqual([]);
    expect(prisma.user.count).toHaveBeenNthCalledWith(2, {
      where: {
        roles: {
          some: {
            tenantId: null,
            role: { name: { in: ['super_admin', 'support', 'operations', 'finance'] } },
          },
        },
      },
    });
    expect(overview).toMatchObject({ totalUsers: 82, totalPlatformStaff: 4 });
  });
});

describe('BusinessDashboardBffService merchant listing', () => {
  it('searches merchant names, slugs, and contact emails across paginated results', async () => {
    const { service, prisma } = makeService();

    await service.getTenantsList('admin-1', undefined, 1, 10, undefined, 'in_review', '  sample shop  ', 'name', 'asc');

    const expectedWhere = {
      appStatus: 'in_review',
      OR: [
        { name: { contains: 'sample shop', mode: 'insensitive' } },
        { slug: { contains: 'sample shop', mode: 'insensitive' } },
        { email: { contains: 'sample shop', mode: 'insensitive' } },
        {
          users: {
            some: {
              role: 'owner',
              user: { email: { contains: 'sample shop', mode: 'insensitive' } },
            },
          },
        },
      ],
    };
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedWhere,
      skip: 0,
      take: 10,
      orderBy: { name: 'asc' },
    }));
    expect(prisma.tenant.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('clamps invalid page sizes and ignores unsupported sort fields', async () => {
    const { service, prisma } = makeService();

    const result = await service.getTenantsList('admin-1', undefined, -3, 1000, undefined, undefined, undefined, 'email', 'asc');

    expect(prisma.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 100,
      orderBy: { createdAt: 'asc' },
    }));
    expect(result.meta).toEqual({ page: 1, limit: 100, total: 0, pages: 0 });
  });
});
