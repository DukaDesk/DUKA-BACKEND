import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PlatformAdminService } from '../../modules/platform-admin/platform-admin.service';
import { TenantContextService } from '../../shared/context/tenant-context.service';

/**
 * Per-tenant API quota gate wired to PlatformAdminService.checkQuota (B5 / KB Next Up).
 * Applies when a tenant is resolved on the request (typically /app/* self-service).
 */
@Injectable()
export class ApiQuotaGuard implements CanActivate {
  private readonly logger = new Logger(ApiQuotaGuard.name);

  constructor(
    private reflector: Reflector,
    private platformAdmin: PlatformAdminService,
    private tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const path: string = request?.url || '';

    // Only meter tenant self-service traffic where a tenant context exists.
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return true;
    if (!path.includes('/app/') && !path.startsWith('/api/v1/app')) return true;

    try {
      const { allowed, remaining } = await this.platformAdmin.checkQuota(tenantId);
      if (!allowed) {
        throw new HttpException(
          {
            code: 'QUOTA_EXCEEDED',
            message: 'API quota exceeded for this merchant',
            remaining,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      // Fire-and-forget increment; failures must not block the request.
      this.platformAdmin.incrementQuota(tenantId).catch((err) => {
        this.logger.warn(`Quota increment failed: ${err.message}`);
      });
      return true;
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`Quota check failed (allowing request): ${err.message}`);
      return true;
    }
  }
}
