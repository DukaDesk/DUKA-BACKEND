import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../common/prisma.service';

export const PLATFORM_ROLES_KEY = 'platform_roles';
export const RequirePlatformRoles = (...roles: string[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);

@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<string[]>(PLATFORM_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const user = context.switchToHttp().getRequest().user;
    if (!user?.id) throw new ForbiddenException('Authentication required');

    const databaseRoles = [...new Set(roles.flatMap((role) => {
      // Platform Operator and Operations are distinct roles: Operations is
      // app-review-only and must never satisfy a platform_operator guard.
      if (role === 'platform_operator') return ['platform_operator'];
      if (role === 'operations') return ['operations'];
      if (role === 'support_agent') return ['support_agent', 'support'];
      return [role];
    }))];
    const assignment = await this.prisma.userRole.findFirst({
      where: {
        userId: user.id,
        tenantId: null,
        role: { name: { in: databaseRoles } },
      },
      select: { id: true },
    });
    if (!assignment) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'access.denied',
          entity: 'api',
          entityId: context.switchToHttp().getRequest().route?.path ?? 'unknown',
          ipAddress: context.switchToHttp().getRequest().ip,
          metadata: {
            outcome: 'denied',
            method: context.switchToHttp().getRequest().method,
            reason: 'insufficient_platform_role',
          },
        },
      });
      throw new ForbiddenException('Insufficient platform role');
    }

    return true;
  }
}
