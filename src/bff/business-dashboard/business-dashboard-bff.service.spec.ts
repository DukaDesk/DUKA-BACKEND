import { BusinessDashboardBffService } from './business-dashboard-bff.service';

function makeService() {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }) },
    userRole: { findFirst: jest.fn().mockResolvedValue({ id: 'role-1' }) },
    tenant: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return { service: new BusinessDashboardBffService(prisma), prisma };
}

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
