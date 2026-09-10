import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class TenantResolverService {
  constructor(private prisma: PrismaService) {}

  async resolveTenantId(userId: string): Promise<string> {
    const tenantUser = await this.prisma.tenantUser.findFirst({
      where: {
        userId,
        role: { in: ['owner', 'manager'] },
        status: 'active',
      },
      select: { tenantId: true },
      orderBy: { role: 'asc' },
    });

    if (!tenantUser) {
      throw new ForbiddenException('User does not have access to any tenant as owner or manager');
    }

    return tenantUser.tenantId;
  }
}