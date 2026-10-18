import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService platform role protections', () => {
  const makeService = (isSuperAdmin: boolean) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'target-user' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      userRole: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const rbacService = {
      userHasRole: jest.fn().mockResolvedValue(isSuperAdmin),
      assignRole: jest.fn().mockResolvedValue(undefined),
    };
    return { service: new UsersService(prisma as any, rbacService as any), prisma, rbacService };
  };

  it('prevents a platform operator from assigning global roles', async () => {
    const { service, rbacService } = makeService(false);

    await expect(service.assignUserRoles('target-user', { role: 'super_admin' }, 'operator-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(rbacService.assignRole).not.toHaveBeenCalled();
  });

  it('maps canonical platform roles to database roles for super admins', async () => {
    const { service, rbacService } = makeService(true);

    await service.assignUserRoles('target-user', { role: 'platform_operator' }, 'super-admin-1');

    expect(rbacService.assignRole).toHaveBeenCalledWith('target-user', 'platform_operator', null);
  });

  it('prevents a platform operator from removing all platform roles', async () => {
    const { service, prisma } = makeService(false);

    await expect(service.removeUser('target-user', undefined, 'operator-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('applies search, safe pagination, and allow-listed sorting to the directory', async () => {
    const { service, prisma } = makeService(true);

    const result = await service.listUsers(0, 500, {
      search: '  ada  ',
      sort: 'email',
      order: 'asc',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { email: { contains: 'ada', mode: 'insensitive' } },
          { firstName: { contains: 'ada', mode: 'insensitive' } },
          { lastName: { contains: 'ada', mode: 'insensitive' } },
        ],
      },
      skip: 0,
      take: 100,
      orderBy: { email: 'asc' },
    }));
    expect(result).toMatchObject({ page: 1, limit: 100, totalPages: 0 });
  });

  it('filters the directory by tenant membership', async () => {
    const { service, prisma } = makeService(true);

    await service.listUsers(1, 25, { tenantId: 'tenant-1' });

    const expectedWhere = {
      tenants: {
        some: { tenantId: 'tenant-1' },
      },
    };
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedWhere,
    }));
    expect(prisma.user.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('filters platform admin listings to global platform-role assignments', async () => {
    const { service, prisma } = makeService(true);

    await service.listUsers(1, 50, { role: 'platform_admin' });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        roles: {
          some: {
            tenantId: null,
            role: {
              name: {
                in: ['super_admin', 'platform_operator', 'operations', 'support_agent', 'support', 'finance'],
              },
            },
          },
        },
      },
    }));
    expect(prisma.user.findMany.mock.calls[0][0].select).toMatchObject({
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
    });
    expect(prisma.user.findMany.mock.calls[0][0].select).not.toHaveProperty('passwordHash');
  });

  it('returns safe user details without authentication secrets or full tenant records', async () => {
    const { service, prisma } = makeService(true);

    await service.getUserById('target-user');

    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        id: true,
        email: true,
        roles: expect.any(Object),
        tenants: expect.any(Object),
      }),
    }));
    const selection = prisma.user.findUnique.mock.calls[0][0].select;
    expect(selection).not.toHaveProperty('passwordHash');
    expect(selection).not.toHaveProperty('googleId');
    expect(selection.tenants.select.tenant.select).toEqual({
      id: true,
      name: true,
      slug: true,
      status: true,
    });
  });

  it('removes only global roles when removing a user from the platform', async () => {
    const { service, prisma } = makeService(true);

    await service.removeUser('target-user', undefined, 'super-admin-1');

    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'target-user', tenantId: null },
    });
  });
});
