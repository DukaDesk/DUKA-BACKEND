import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(private prisma: PrismaService) {}

  async userHasPermission(userId: string, permission: string, tenantId?: string): Promise<boolean> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });

    for (const ur of userRoles) {
      if (ur.tenantId && ur.tenantId !== tenantId) continue;
      for (const rp of ur.role.permissions) {
        if (rp.permission.name === permission) return true;
      }
    }
    return false;
  }

  async userHasRole(userId: string, roleName: string, tenantId?: string): Promise<boolean> {
    const where: any = { userId, role: { name: roleName } };
    if (tenantId) where.tenantId = tenantId;
    const count = await this.prisma.userRole.count({ where });
    return count > 0;
  }

  async assignRole(userId: string, roleName: string, tenantId?: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new Error(`Role '${roleName}' not found`);

    await this.prisma.userRole.create({
      data: { userId, roleId: role.id, tenantId },
    });
  }

  async removeRole(userId: string, roleName: string, tenantId?: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) return;

    const where: any = { userId, roleId: role.id };
    if (tenantId) where.tenantId = tenantId;

    await this.prisma.userRole.deleteMany({ where });
  }
}
