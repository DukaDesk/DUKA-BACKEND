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
      throw new ForbiddenException({ code: 'MERCHANT_ACCESS_REQUIRED', message: 'User does not have access to a merchant as owner or manager' });
    }

    return tenantUser.tenantId;
  }
}