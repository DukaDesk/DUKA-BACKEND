import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../common/prisma.service';
import { PlatformRoleGuard, PLATFORM_ROLES_KEY } from './platform-role.guard';

describe('PlatformRoleGuard', () => {
  let guard: PlatformRoleGuard;
  let findFirst: jest.Mock;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    findFirst = jest.fn();
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(['super_admin', 'operations']) };
    guard = new PlatformRoleGuard(
      reflector as unknown as Reflector,
      { userRole: { findFirst } } as unknown as PrismaService,
    );
  });

  const makeContext = (user: { id?: string } | null) => ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

  it('accepts only an assigned global platform role from the route metadata', async () => {
    findFirst.mockResolvedValue({ id: 'assignment-1' });

    await expect(guard.canActivate(makeContext({ id: 'admin-1' }))).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PLATFORM_ROLES_KEY, expect.any(Array));
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'admin-1', tenantId: null, role: { name: { in: ['super_admin', 'operations'] } } },
      select: { id: true },
    });
  });

  it('denies users without the required global role', async () => {
    findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext({ id: 'support-1' }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
