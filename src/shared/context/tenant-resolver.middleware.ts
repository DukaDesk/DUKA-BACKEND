import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../common/prisma.service';
import { TenantContextService } from './tenant-context.service';
import { TenantContext } from './tenant-context.interface';

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const tenantId = (req.headers['x-tenant-id'] as string) || (req.params.tenantId as string);
    const slug = req.headers['x-tenant-slug'] as string;
    const host = req.hostname;
    const platformDomain = this.configService.get<string>('PLATFORM_DOMAIN', 'dukadesk.app');

    let context: TenantContext | undefined;

    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, slug: true, name: true, status: true },
      });
      if (tenant) {
        context = { tenantId: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status };
      }
    } else if (slug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true, slug: true, name: true, status: true },
      });
      if (tenant) {
        context = { tenantId: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status };
      }
    } else if (host && host.includes(platformDomain)) {
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
        const tenant = await this.prisma.tenant.findUnique({
          where: { slug: subdomain },
          select: { id: true, slug: true, name: true, status: true },
        });
        if (tenant) {
          context = { tenantId: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status };
        }
      }
    }

    if (context) {
      this.tenantContext.run(context, () => next());
    } else {
      next();
    }
  }
}
