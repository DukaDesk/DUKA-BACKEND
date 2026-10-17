import { CallHandler, ExecutionContext, HttpException } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import { PrismaService } from '../../common/prisma.service';
import { PlatformAuditInterceptor } from './platform-audit.interceptor';

describe('PlatformAuditInterceptor', () => {
  const makeContext = (request: Record<string, any>) => ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

  it('records failed admin mutations without request payloads and rethrows the original error', async () => {
    const create = jest.fn().mockResolvedValue({});
    const interceptor = new PlatformAuditInterceptor({ auditLog: { create } } as unknown as PrismaService);
    const failure = new HttpException('Invalid operation', 400);
    const next = { handle: () => throwError(() => failure) } as CallHandler;
    const request = {
      method: 'POST',
      baseUrl: '/v1',
      route: { path: '/admin/merchants/:merchantId/suspend' },
      params: { merchantId: 'merchant-1' },
      user: { id: 'admin-1' },
      body: { password: 'never-audit-this' },
      headers: { 'x-request-id': 'request-1' },
    };

    await expect(lastValueFrom(interceptor.intercept(makeContext(request), next))).rejects.toBe(failure);
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'admin.post',
        entity: 'api',
        entityId: '/v1/admin/merchants/:merchantId/suspend',
        metadata: {
          outcome: 'failed',
          method: 'POST',
          statusCode: 400,
          requestId: 'request-1',
          errorType: 'HttpException',
        },
      },
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain('never-audit-this');
  });

  it('does not audit successful or non-admin read requests', async () => {
    const create = jest.fn();
    const interceptor = new PlatformAuditInterceptor({ auditLog: { create } } as unknown as PrismaService);
    const next = { handle: () => throwError(() => new HttpException('Not found', 404)) } as CallHandler;

    await expect(lastValueFrom(interceptor.intercept(makeContext({
      method: 'GET',
      route: { path: '/admin/audit' },
    }), next))).rejects.toBeInstanceOf(HttpException);
    await expect(lastValueFrom(interceptor.intercept(makeContext({
      method: 'POST',
      route: { path: '/orders' },
    }), next))).rejects.toBeInstanceOf(HttpException);

    expect(create).not.toHaveBeenCalled();
  });

  it('classifies authentication failures as denied', async () => {
    const create = jest.fn().mockResolvedValue({});
    const interceptor = new PlatformAuditInterceptor({ auditLog: { create } } as unknown as PrismaService);
    const next = { handle: () => throwError(() => new HttpException('Forbidden', 403)) } as CallHandler;

    await expect(lastValueFrom(interceptor.intercept(makeContext({
      method: 'PATCH',
      route: { path: '/admin/settings' },
      user: { id: 'admin-1' },
    }), next))).rejects.toBeInstanceOf(HttpException);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ outcome: 'denied', statusCode: 403 }),
      }),
    }));
  });
});
