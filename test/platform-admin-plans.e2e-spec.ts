import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/common/prisma.service';
import { PlatformRoleGuard } from '../src/modules/admin/platform-role.guard';
import { PlatformAdminController } from '../src/modules/platform-admin/platform-admin.controller';
import { PlatformAdminService } from '../src/modules/platform-admin/platform-admin.service';

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

describe('Platform plan quota API (e2e)', () => {
  let app: INestApplication;
  let roleAssignment: { findFirst: jest.Mock };
  let auditCreate: jest.Mock;
  let adminService: {
    getAllPlans: jest.Mock;
    getPlan: jest.Mock;
    updatePlan: jest.Mock;
  };

  beforeEach(async () => {
    const platformRolesByUser: Record<string, string[]> = {
      'operator-1': ['platform_operator'],
      'super-1': ['super_admin'],
      'reviewer-1': ['operations'],
    };
    roleAssignment = {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const assigned = platformRolesByUser[where.userId] ?? [];
        const requested: string[] = where?.role?.name?.in ?? [];
        return Promise.resolve(
          assigned.some((role) => requested.includes(role)) ? { id: 'assignment-1' } : null,
        );
      }),
    };
    auditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
    adminService = {
      getAllPlans: jest.fn().mockResolvedValue([{ id: 'plan-pro', limits: { dailyPromoPosts: 3 } }]),
      getPlan: jest.fn().mockResolvedValue({ id: 'plan-pro' }),
      updatePlan: jest.fn().mockResolvedValue({
        id: 'plan-pro',
        limits: { maxProducts: 500, storageGb: 10, dailyPromoPosts: 7 },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformAdminController],
      providers: [
        { provide: PlatformAdminService, useValue: adminService },
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
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

  const put = (path: string, user?: string, body?: unknown) => {
    const req = request(app.getHttpServer()).put(path).send(body ?? {});
    return user ? req.set('x-test-user', user) : req;
  };

  it('rejects unauthenticated plan writes with 401', async () => {
    const res = await put('/api/v1/admin/plans/plan-pro', undefined, {
      limits: { dailyPromoPosts: 7 },
    }).expect(401);

    expect(res.body).toEqual({ success: false, errors: ['Invalid or expired token'] });
    expect(adminService.updatePlan).not.toHaveBeenCalled();
  });

  it('denies operations the promo quota write and audits it', async () => {
    const res = await put(
      '/api/v1/admin/plans/plan-pro',
      asHeader('reviewer-1', 'operations'),
      { limits: { dailyPromoPosts: 7 } },
    ).expect(403);

    expect(res.body.errors).toContain('Insufficient platform role');
    expect(adminService.updatePlan).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'reviewer-1',
        action: 'access.denied',
        metadata: expect.objectContaining({ reason: 'insufficient_platform_role' }),
      }),
    });
  });

  it('lets platform_operator save a per-plan daily promo quota', async () => {
    const limits = { maxProducts: 500, storageGb: 10, dailyPromoPosts: 7 };

    const res = await put(
      '/api/v1/admin/plans/plan-pro',
      asHeader('operator-1', 'platform_operator'),
      { limits },
    ).expect(200);

    expect(res.body).toEqual({
      success: true,
      message: 'OK',
      data: { id: 'plan-pro', limits },
    });
    expect(adminService.updatePlan).toHaveBeenCalledWith('plan-pro', { limits });
  });

  it('lets platform_operator and super_admin read plans', async () => {
    await get('/api/v1/admin/plans', asHeader('operator-1', 'platform_operator')).expect(200);
    await get('/api/v1/admin/plans/plan-pro', asHeader('super-1', 'super_admin')).expect(200);

    expect(adminService.getAllPlans).toHaveBeenCalledTimes(1);
    expect(adminService.getPlan).toHaveBeenCalledWith('plan-pro');
  });
});
