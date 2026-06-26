import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async approveTenant(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'published', publishedAt: new Date() },
    });
  }

  async suspendTenant(tenantId: string, adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'suspended' },
    });
  }

  async getTenants(adminUserId: string, status?: string) {
    await this.verifyAdmin(adminUserId);

    const where: any = {};
    if (status) where.status = status;

    return this.prisma.tenant.findMany({
      where,
      include: { _count: { select: { users: true, products: true, pages: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const [totalTenants, totalUsers, totalProducts, publishedTenants] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.product.count(),
      this.prisma.tenant.count({ where: { status: 'published' } }),
    ]);

    return {
      totalTenants,
      publishedTenants,
      draftTenants: totalTenants - publishedTenants,
      totalUsers,
      totalProducts,
    };
  }

  private async verifyAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
  }
}
