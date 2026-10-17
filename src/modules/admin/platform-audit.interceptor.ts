import {
  CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';

@Injectable()
export class PlatformAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PlatformAuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = String(request.method || '').toUpperCase();
    const routePath = `${request.baseUrl || ''}${request.route?.path || request.path || request.url?.split('?')[0] || ''}`;
    const isAdminRoute = /(^|\/)admin(\/|$)/i.test(routePath);
    if (!isAdminRoute || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next.handle();

    return next.handle().pipe(
      catchError((error: unknown) => from(this.recordFailure(request, routePath, method, error)).pipe(
        mergeMap(() => throwError(() => error)),
      )),
    );
  }

  private async recordFailure(
    request: any,
    routePath: string,
    method: string,
    error: unknown,
  ): Promise<void> {
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    const outcome = statusCode === 401 || statusCode === 403 ? 'denied' : 'failed';

    try {
      await this.prisma.auditLog.create({
        data: {
          userId: request.user?.id ?? null,
          action: `admin.${method.toLowerCase()}`,
          entity: 'api',
          entityId: routePath,
          metadata: {
            outcome,
            method,
            statusCode,
            requestId: request.correlationId
              ?? request.requestId
              ?? request.headers?.['x-correlation-id']
              ?? request.headers?.['x-request-id']
              ?? null,
            errorType: error instanceof Error ? error.name : 'UnknownError',
          },
        },
      });
    } catch (auditError) {
      this.logger.error(
        `Failed to persist admin failure audit for ${method} ${routePath}: ${auditError instanceof Error ? auditError.name : 'UnknownError'}`,
      );
    }
  }
}
