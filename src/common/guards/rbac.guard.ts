import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../modules/rbac/rbac.service';
import { PERMISSIONS_KEY, ROLES_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions && !requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const tenantId = request.params?.tenantId || request.headers['x-tenant-id'];

    if (requiredRoles) {
      for (const role of requiredRoles) {
        const hasRole = await this.rbacService.userHasRole(user.id, role, tenantId);
        if (hasRole) return true;
      }
    }

    if (requiredPermissions) {
      for (const permission of requiredPermissions) {
        const hasPermission = await this.rbacService.userHasPermission(user.id, permission, tenantId);
        if (hasPermission) return true;
      }
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
