import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class QrService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async generate(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const baseUrl = this.configService.get<string>('PLATFORM_URL', 'https://dukadesk.app');
    const qrData = {
      tenantId: tenant.id,
      slug: tenant.slug,
      url: `${baseUrl}/t/${tenant.slug}`,
    };

    return qrData;
  }

  async resolve(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug, status: 'published' },
      select: { id: true, name: true, slug: true, logo: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found or not published');
    }

    return {
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logo: tenant.logo,
      url: `dukadesk://tenant/${tenant.slug}`,
    };
  }
}
