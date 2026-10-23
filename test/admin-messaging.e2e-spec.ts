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
import { AdminMessagingController } from '../src/modules/admin/admin-messaging.controller';
import { PlatformRoleGuard } from '../src/modules/admin/platform-role.guard';
import { CommsService } from '../src/modules/comms/comms.service';
import { MediaService } from '../src/modules/media/media.service';

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

describe('Admin messaging API (e2e)', () => {
  let app: INestApplication;
  let roleAssignment: { findFirst: jest.Mock };
  let auditCreate: jest.Mock;
  let comms: {
    createAnnouncement: jest.Mock;
    listAll: jest.Mock;
    getThread: jest.Mock;
    addPlatformReply: jest.Mock;
    deleteAnnouncement: jest.Mock;
    getPlatformTenantId: jest.Mock;
  };
  let media: { upload: jest.Mock };

  beforeEach(async () => {
    const platformRolesByUser: Record<string, string[]> = {
      'operator-1': ['platform_operator'],
      'super-1': ['super_admin'],
      'reviewer-1': ['operations'],
      'support-1': ['support_agent'],
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
    comms = {
      createAnnouncement: jest.fn().mockResolvedValue({ id: 'msg-1', kind: 'broadcast' }),
      listAll: jest.fn().mockResolvedValue({ data: [{ id: 'msg-1' }], total: 1 }),
      getThread: jest.fn().mockResolvedValue({ id: 'msg-1', replies: [] }),
      addPlatformReply: jest.fn().mockResolvedValue({ id: 'reply-1', body: 'Noted' }),
      deleteAnnouncement: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      getPlatformTenantId: jest.fn().mockResolvedValue('platform-tenant'),
    };
    media = { upload: jest.fn().mockResolvedValue({ url: 'https://cdn.test/a.png' }) };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminMessagingController],
      providers: [
        { provide: CommsService, useValue: comms },
        { provide: MediaService, useValue: media },
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

  const post = (path: string, user?: string, body?: unknown) => {
    const req = request(app.getHttpServer()).post(path).send(body ?? {});
    return user ? req.set('x-test-user', user) : req;
  };

  const del = (path: string, user?: string) => {
    const req = request(app.getHttpServer()).delete(path);
    return user ? req.set('x-test-user', user) : req;
  };

  it('rejects unauthenticated inbox access with 401', async () => {
    const res = await get('/api/v1/admin/messages').expect(401);

    expect(res.body).toEqual({ success: false, errors: ['Invalid or expired token'] });
    expect(comms.listAll).not.toHaveBeenCalled();
  });

  it('denies support_agent and audits the denial', async () => {
    const res = await get('/api/v1/admin/messages', asHeader('support-1', 'support_agent')).expect(403);

    expect(res.body).toEqual({ success: false, errors: ['Insufficient platform role'] });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'support-1',
        action: 'access.denied',
        entity: 'api',
        metadata: expect.objectContaining({
          outcome: 'denied',
          reason: 'insufficient_platform_role',
        }),
      }),
    });
    expect(comms.listAll).not.toHaveBeenCalled();
    expect(roleAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'support-1',
          tenantId: null,
          role: { name: { in: ['super_admin', 'platform_operator'] } },
        }),
      }),
    );
  });

  it('never lets operations send platform messages', async () => {
    const res = await post(
      '/api/v1/admin/messages',
      asHeader('reviewer-1', 'operations'),
      { kind: 'broadcast', audience: 'both', body: 'Platform update' },
    ).expect(403);

    expect(res.body.errors).toContain('Insufficient platform role');
    expect(comms.createAnnouncement).not.toHaveBeenCalled();
  });

  it('lets platform_operator list the inbox with parsed filters', async () => {
    const res = await get(
      '/api/v1/admin/messages?page=2&limit=5&kind=direct&audience=mobile',
      asHeader('operator-1', 'platform_operator'),
    ).expect(200);

    expect(res.body).toEqual({
      success: true,
      message: 'OK',
      data: { data: [{ id: 'msg-1' }], total: 1 },
    });
    expect(comms.listAll).toHaveBeenCalledWith(2, 5, 'direct', 'mobile');
  });

  it('lets platform_operator send a broadcast with the validated payload', async () => {
    const payload = {
      kind: 'broadcast',
      audience: 'both',
      title: 'Maintenance',
      body: 'Platform maintenance tonight at 22:00.',
    };

    const res = await post(
      '/api/v1/admin/messages',
      asHeader('operator-1', 'platform_operator'),
      payload,
    ).expect(201);

    expect(res.body).toEqual({ success: true, message: 'OK', data: { id: 'msg-1', kind: 'broadcast' } });
    expect(comms.createAnnouncement).toHaveBeenCalledWith(payload);
  });

  it('rejects malformed messages before reaching the service', async () => {
    const user = asHeader('operator-1', 'platform_operator');

    await post('/api/v1/admin/messages', user, { kind: 'push', body: 'x' }).expect(400);
    await post('/api/v1/admin/messages', user, { kind: 'broadcast' }).expect(400);
    await post('/api/v1/admin/messages', user, {
      kind: 'broadcast',
      body: 'x',
      unexpected: true,
    }).expect(400);
    await post('/api/v1/admin/messages', user, {
      kind: 'direct',
      tenantId: 'not-a-uuid',
      body: 'x',
    }).expect(400);
    await get('/api/v1/admin/messages?limit=51', user).expect(400);

    expect(comms.createAnnouncement).not.toHaveBeenCalled();
    expect(comms.listAll).not.toHaveBeenCalled();
  });

  it('lets platform_operator open a thread, reply, and retract', async () => {
    const user = asHeader('operator-1', 'platform_operator');

    await get('/api/v1/admin/messages/msg-1', user).expect(200);
    expect(comms.getThread).toHaveBeenCalledWith('msg-1');

    const reply = await post('/api/v1/admin/messages/msg-1/replies', user, { body: 'Noted' }).expect(201);
    expect(reply.body).toEqual({ success: true, message: 'OK', data: { id: 'reply-1', body: 'Noted' } });
    expect(comms.addPlatformReply).toHaveBeenCalledWith('msg-1', 'Noted');

    const removed = await del('/api/v1/admin/messages/msg-1', user).expect(200);
    expect(removed.body).toEqual({ success: true, message: 'OK', data: { id: 'msg-1' } });
    expect(comms.deleteAnnouncement).toHaveBeenCalledWith('msg-1');
  });

  it('allows super_admin to retract a message', async () => {
    await del('/api/v1/admin/messages/msg-2', asHeader('super-1', 'super_admin')).expect(200);

    expect(comms.deleteAnnouncement).toHaveBeenCalledWith('msg-2');
  });

  it('revokes messaging access immediately when the role assignment is removed', async () => {
    roleAssignment.findFirst
      .mockResolvedValueOnce({ id: 'assignment-1' })
      .mockResolvedValueOnce(null);

    await get('/api/v1/admin/messages', asHeader('operator-1', 'platform_operator')).expect(200);

    const revoked = await get('/api/v1/admin/messages', asHeader('operator-1', 'platform_operator')).expect(403);

    expect(revoked.body.errors).toContain('Insufficient platform role');
    expect(comms.listAll).toHaveBeenCalledTimes(1);
  });
});
