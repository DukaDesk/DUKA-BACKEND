import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma.service';
import { AdminController } from '../src/modules/admin/admin.controller';
import { AdminInviteService } from '../src/modules/admin/admin-invite.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { MerchantAppReviewService } from '../src/modules/admin/merchant-app-review.service';
import { PlatformRoleGuard } from '../src/modules/admin/platform-role.guard';

const headerAuthGuard = {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const raw = req.headers['x-test-user'];
    if (!raw) throw new UnauthorizedException('Invalid or expired token');
    req.user = JSON.parse(String(raw));
    return true;
  },
};

const asHeader = (id: string, role: string) =>
  JSON.stringify({ id, email: `${id}@dukadesk.com`, role });

describe('Admin API direct authorization (e2e)', () => {
  let app: INestApplication;
  let roleAssignment: { findFirst: jest.Mock };
  let auditCreate: jest.Mock;
  let adminService: { getMerchantStats: jest.Mock };
  let inviteService: { listInvites: jest.Mock };
  let reviewService: { approveApp: jest.Mock };

  beforeEach(async () => {
    const platformRolesByUser: Record<string, string[]> = {
      'operator-1': ['platform_operator'],
      'reviewer-1': ['operations'],
      'super-1': ['super_admin'],
    };
    roleAssignment = {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const assigned = platformRolesByUser[where.userId] ?? [];
        const requested: string[] = where?.role?.name?.in ?? [];
        const match = assigned.some((role) => requested.includes(role));
        return Promise.resolve(match ? { id: 'assignment-1' } : null);
      }),
    };
    auditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
    adminService = { getMerchantStats: jest.fn().mockResolvedValue({ total: 12 }) };
    inviteService = { listInvites: jest.fn().mockResolvedValue([]) };
    reviewService = { approveApp: jest.fn().mockResolvedValue({ published: true }) };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: AdminInviteService, useValue: inviteService },
        { provide: MerchantAppReviewService, useValue: reviewService },
        {
          provide: PrismaService,
          useValue: { userRole: roleAssignment, auditLog: { create: auditCreate } },
        },
        PlatformRoleGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(headerAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (path: string, user?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return user ? req.set('x-test-user', user) : req;
  };

  const post = (path: string, user?: string) => {
    const req = request(app.getHttpServer()).post(path);
    return user ? req.set('x-test-user', user) : req;
  };

  it('rejects unauthenticated direct API calls with 401', async () => {
    const res = await get('/api/v1/admin/merchants/stats').expect(401);

    expect(res.body).toEqual({
      success: false,
      errors: ['Invalid or expired token'],
    });
  });

  it('rejects an authenticated user without a platform role and audits the denial', async () => {
    roleAssignment.findFirst.mockResolvedValue(null);

    const res = await get(
      '/api/v1/admin/merchants/stats',
      asHeader('merchant-1', 'merchant_owner'),
    ).expect(403);

    expect(res.body).toEqual({ success: false, errors: ['Insufficient platform role'] });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'merchant-1',
        action: 'access.denied',
        entity: 'api',
        metadata: expect.objectContaining({
          outcome: 'denied',
          reason: 'insufficient_platform_role',
        }),
      }),
    });
    expect(roleAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'merchant-1',
          tenantId: null,
          role: { name: { in: ['super_admin', 'platform_operator'] } },
        }),
      }),
    );
  });

  it('allows platform_operator on platform-admin merchant routes', async () => {
    const res = await get(
      '/api/v1/admin/merchants/stats',
      asHeader('operator-1', 'platform_operator'),
    ).expect(200);

    expect(res.body).toEqual({ success: true, message: 'OK', data: { total: 12 } });
    expect(adminService.getMerchantStats).toHaveBeenCalledWith('operator-1');
  });

  it('never lets operations satisfy a platform_operator guard', async () => {
    const res = await get(
      '/api/v1/admin/merchants/stats',
      asHeader('reviewer-1', 'operations'),
    ).expect(403);

    expect(res.body.errors).toContain('Insufficient platform role');
    expect(roleAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { name: { in: ['super_admin', 'platform_operator'] } },
        }),
      }),
    );
    expect(adminService.getMerchantStats).not.toHaveBeenCalled();
  });

  it('allows operations to approve an app release', async () => {
    const res = await post(
      '/api/v1/admin/merchants/m1/apps/approve',
      asHeader('reviewer-1', 'operations'),
    ).expect(201);

    expect(res.body).toEqual({
      success: true,
      message: 'OK',
      data: { published: true },
    });
    expect(reviewService.approveApp).toHaveBeenCalledWith('m1', 'reviewer-1');
  });

  it('blocks platform_operator from the app-review-only approval route', async () => {
    const res = await post(
      '/api/v1/admin/merchants/m1/apps/approve',
      asHeader('operator-1', 'platform_operator'),
    ).expect(403);

    expect(res.body.errors).toContain('Insufficient platform role');
    expect(reviewService.approveApp).not.toHaveBeenCalled();
    expect(roleAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { name: { in: ['super_admin', 'operations'] } },
        }),
      }),
    );
  });

  it('allows super_admin to list admin invites', async () => {
    const res = await get(
      '/api/v1/admin/invites',
      asHeader('super-1', 'super_admin'),
    ).expect(200);

    expect(res.body).toEqual({ success: true, message: 'OK', data: [] });
    expect(inviteService.listInvites).toHaveBeenCalled();
  });

  it('blocks operations from super-admin-only invite management', async () => {
    const res = await get(
      '/api/v1/admin/invites',
      asHeader('reviewer-1', 'operations'),
    ).expect(403);

    expect(res.body.errors).toContain('Insufficient platform role');
    expect(inviteService.listInvites).not.toHaveBeenCalled();
    expect(roleAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { name: { in: ['super_admin'] } },
        }),
      }),
    );
  });

  it('revokes access immediately when the platform role assignment is removed', async () => {
    roleAssignment.findFirst
      .mockResolvedValueOnce({ id: 'assignment-1' })
      .mockResolvedValueOnce(null);

    await get(
      '/api/v1/admin/merchants/stats',
      asHeader('operator-1', 'platform_operator'),
    ).expect(200);

    const revoked = await get(
      '/api/v1/admin/merchants/stats',
      asHeader('operator-1', 'platform_operator'),
    ).expect(403);

    expect(revoked.body.errors).toContain('Insufficient platform role');
    expect(adminService.getMerchantStats).toHaveBeenCalledTimes(1);
  });
});
