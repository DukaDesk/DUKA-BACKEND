import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../common/prisma.service';
import { AdminController } from './admin.controller';
import { PlatformRoleGuard, PLATFORM_ROLES_KEY } from './platform-role.guard';
import { UsersController } from '../users/users.controller';
import { BusinessDashboardBffController } from '../../bff/business-dashboard/business-dashboard-bff.controller';

describe('PlatformRoleGuard', () => {
  let guard: PlatformRoleGuard;
  let findFirst: jest.Mock;
  let auditCreate: jest.Mock;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    findFirst = jest.fn();
    auditCreate = jest.fn().mockResolvedValue({});
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(['super_admin', 'platform_operator']) };
    guard = new PlatformRoleGuard(
      reflector as unknown as Reflector,
      { userRole: { findFirst }, auditLog: { create: auditCreate } } as unknown as PrismaService,
    );
  });

  const makeContext = (user: { id?: string } | null) => ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user, route: { path: '/admin/users' }, method: 'GET', ip: '127.0.0.1' }) }),
  }) as unknown as ExecutionContext;

  it('accepts only an assigned global platform role from the route metadata', async () => {
    findFirst.mockResolvedValue({ id: 'assignment-1' });

    await expect(guard.canActivate(makeContext({ id: 'admin-1' }))).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PLATFORM_ROLES_KEY, expect.any(Array));
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'admin-1', tenantId: null, role: { name: { in: ['super_admin', 'platform_operator'] } } },
      select: { id: true },
    });
  });

  it('does not let the app-review Operations role satisfy a platform_operator guard', async () => {
    reflector.getAllAndOverride.mockReturnValue(['super_admin', 'platform_operator']);
    findFirst.mockResolvedValue({ id: 'assignment-1' });

    await expect(guard.canActivate(makeContext({ id: 'ops-1' }))).resolves.toBe(true);

    const [{ where }] = findFirst.mock.calls[0];
    expect(where.role.name.in).toEqual(['super_admin', 'platform_operator']);
    expect(where.role.name.in).not.toContain('operations');
  });

  it('resolves Operations routes to the distinct operations DB role only', async () => {
    reflector.getAllAndOverride.mockReturnValue(['super_admin', 'operations']);
    findFirst.mockResolvedValue({ id: 'assignment-1' });

    await expect(guard.canActivate(makeContext({ id: 'ops-1' }))).resolves.toBe(true);

    const [{ where }] = findFirst.mock.calls[0];
    expect(where.role.name.in).toEqual(['super_admin', 'operations']);
    expect(where.role.name.in).not.toContain('platform_operator');
  });

  it('denies users without the required global role', async () => {
    findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext({ id: 'support-1' }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'support-1',
        action: 'access.denied',
        entity: 'api',
        entityId: '/admin/users',
        ipAddress: '127.0.0.1',
        metadata: { outcome: 'denied', method: 'GET', reason: 'insufficient_platform_role' },
      }),
    }));
  });

  it('honors role revocation on the next protected request', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 'assignment-1' })
      .mockResolvedValueOnce(null);

    await expect(guard.canActivate(makeContext({ id: 'admin-1' }))).resolves.toBe(true);
    await expect(guard.canActivate(makeContext({ id: 'admin-1' })))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('restricts invite endpoints to super admins despite broader controller access', () => {
    expect(Reflect.getMetadata(PLATFORM_ROLES_KEY, UsersController)).toEqual(['super_admin']);
    for (const handler of [
      AdminController.prototype.createInvite,
      AdminController.prototype.listInvites,
      AdminController.prototype.revokeInvite,
    ]) {
      expect(Reflect.getMetadata(PLATFORM_ROLES_KEY, handler)).toEqual(['super_admin']);
    }
  });

  it('keeps app review routes limited to super admins and Operations', () => {
    for (const handler of [
      AdminController.prototype.getMerchantAppReview,
      AdminController.prototype.getMerchantPreview,
      AdminController.prototype.approveApp,
      AdminController.prototype.rejectApp,
    ]) {
      expect(Reflect.getMetadata(PLATFORM_ROLES_KEY, handler)).toEqual(['super_admin', 'operations']);
    }
  });

  it('restricts central audit search to platform managers', () => {
    expect(Reflect.getMetadata(PLATFORM_ROLES_KEY, BusinessDashboardBffController))
      .toEqual(['super_admin', 'platform_operator']);
    expect(Reflect.getMetadata(PLATFORM_ROLES_KEY, BusinessDashboardBffController.prototype.getAuditLogs))
      .toBeUndefined();
  });
});
