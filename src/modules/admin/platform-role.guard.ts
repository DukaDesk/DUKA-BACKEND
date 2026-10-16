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

    const assignment = await this.prisma.userRole.findFirst({
      where: {
        userId: user.id,
        tenantId: null,
        role: { name: { in: roles } },
      },
      select: { id: true },
    });
    if (!assignment) throw new ForbiddenException('Insufficient platform role');

    return true;
  }
}
