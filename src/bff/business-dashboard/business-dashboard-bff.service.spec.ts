import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BusinessDashboardBffService } from './business-dashboard-bff.service';

function makeService() {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn()
        .mockResolvedValueOnce(82)
        .mockResolvedValueOnce(4),
    },
    userRole: {
      findFirst: jest.fn().mockResolvedValue({ id: 'role-1' }),
      findMany: jest.fn().mockResolvedValue([{ role: { name: 'platform_operator' } }]),
    },
    tenant: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    product: { count: jest.fn().mockResolvedValue(0) },
    order: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { total: null } }),
    },
    analyticsEvent: { groupBy: jest.fn().mockResolvedValue([]) },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
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
            role: { name: { in: ['super_admin', 'platform_operator', 'support', 'operations', 'finance'] } },
          },
        },
      },
    });
    expect(prisma.tenant.count).toHaveBeenCalledWith({ where: { appStatus: 'in_review' } });
    expect(overview).toMatchObject({ totalUsers: 82, totalPlatformStaff: 4, inReviewTenants: 0 });
  });
});

describe('BusinessDashboardBffService platform analytics', () => {
  it('counts unique active users alongside paid-order platform metrics', async () => {
    const { service, prisma } = makeService();
    prisma.order.findMany.mockResolvedValue([
      { createdAt: new Date('2025-01-02T12:00:00.000Z'), total: 120 },
      { createdAt: new Date('2025-01-02T13:00:00.000Z'), total: 80 },
    ]);
    prisma.tenant.count.mockResolvedValue(7);
    prisma.analyticsEvent.groupBy.mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]);
    prisma.user.findMany.mockResolvedValue([
      { createdAt: new Date('2025-01-02T10:00:00.000Z') },
      { createdAt: new Date('2025-01-02T11:00:00.000Z') },
      { createdAt: new Date('2025-01-03T10:00:00.000Z') },
    ]);

    const result = await service.getAnalytics('2025-01-01T00:00:00.000Z', '2025-01-31T23:59:59.999Z', 'day');

    expect(prisma.analyticsEvent.groupBy).toHaveBeenCalledWith({
      by: ['userId'],
      where: {
        timestamp: {
          gte: new Date('2025-01-01T00:00:00.000Z'),
          lte: new Date('2025-01-31T23:59:59.999Z'),
        },
        userId: { not: null },
      },
    });
    expect(result).toMatchObject({
      gmv: 200,
      activeTenants: 7,
      activeUsers: 2,
      orderVolume: [{ period: '2025-01-02', count: 2 }],
      userGrowth: [
        { period: '2025-01-02', count: 2 },
        { period: '2025-01-03', count: 1 },
      ],
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date('2025-01-01T00:00:00.000Z'),
          lte: new Date('2025-01-31T23:59:59.999Z'),
        },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  });
});

describe('BusinessDashboardBffService audit search', () => {
  it('searches and paginates audit records while returning a safe normalized view', async () => {
    const { service, prisma } = makeService();
    prisma.auditLog.findMany.mockResolvedValue([{
      id: 'audit-1',
      createdAt: new Date('2025-01-12T12:00:00.000Z'),
      action: 'merchant.app_approve',
      entity: 'tenant',
      entityId: 'tenant-1',
      metadata: { version: '2.0.0', releaseId: 'release-1', outcome: 'denied', accessToken: 'must-not-leak' },
      user: { id: 'admin-1', email: 'admin@example.test' },
    }]);
    prisma.auditLog.count.mockResolvedValue(31);

    const result = await service.getRecentAuditLogs({
      page: 2,
      limit: 15,
      search: '  admin  ',
      action: 'merchant.app_approve',
      from: '2025-01-01',
      to: '2025-01-31',
      sort: 'action',
      order: 'asc',
    });

    const where = {
      action: 'merchant.app_approve',
      OR: [
        { action: { contains: 'admin', mode: 'insensitive' } },
        { entity: { contains: 'admin', mode: 'insensitive' } },
        { entityId: { contains: 'admin', mode: 'insensitive' } },
        { user: { email: { contains: 'admin', mode: 'insensitive' } } },
      ],
      createdAt: {
        gte: new Date('2025-01-01T00:00:00.000Z'),
        lte: new Date('2025-01-31T23:59:59.999Z'),
      },
    };
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where,
      orderBy: { action: 'asc' },
      skip: 15,
      take: 15,
      include: { user: { select: { id: true, email: true } } },
    });
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where });
    expect(result).toMatchObject({
      data: [{
        id: 'audit-1',
        adminEmail: 'admin@example.test',
        targetType: 'tenant',
        targetId: 'tenant-1',
        outcome: 'denied',
        metadata: { version: '2.0.0', releaseId: 'release-1', outcome: 'denied' },
      }],
      meta: { page: 2, limit: 15, total: 31, pages: 3 },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  it('rejects malformed audit date filters', async () => {
    const { service, prisma } = makeService();

    await expect(service.getRecentAuditLogs({ from: 'not-a-date' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('filters audit records by actor, resource, and recorded outcome', async () => {
    const { service, prisma } = makeService();

    await service.getRecentAuditLogs({
      actor: 'operator@example.test',
      resource: 'tenant',
      outcome: 'denied',
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        user: {
          OR: [
            { id: 'operator@example.test' },
            { email: { contains: 'operator@example.test', mode: 'insensitive' } },
          ],
        },
        entity: { contains: 'tenant', mode: 'insensitive' },
        metadata: { path: ['outcome'], equals: 'denied' },
      },
    }));
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

  it('limits Operations to app-review rows and does not expose merchant management filters', async () => {
    const { service, prisma } = makeService();
    prisma.userRole.findMany.mockResolvedValue([{ role: { name: 'operations' } }]);

    await service.getTenantsList(
      'operations-1',
      'suspended',
      1,
      10,
      'verified',
      undefined,
      '  sample shop  ',
      'email',
      'asc',
    );

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: {
        appStatus: 'in_review',
        name: { contains: 'sample shop', mode: 'insensitive' },
      },
      select: { id: true, name: true, appStatus: true },
      skip: 0,
      take: 10,
      orderBy: { createdAt: 'asc' },
    });
  });

  it('denies Support Agent access to the platform merchant listing', async () => {
    const { service, prisma } = makeService();
    prisma.userRole.findMany.mockResolvedValue([{ role: { name: 'support' } }]);

    await expect(service.getTenantsList('support-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
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
