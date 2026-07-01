import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ManifestCompiler {
  constructor(private prisma: PrismaService) {}

  async compile(tenantId: string): Promise<{ manifest: any; checksum: string; version: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        theme: true,
        navigation: true,
        config: true,
        subscription: { include: { plan: true } },
        pages: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            sections: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                components: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const features = (tenant.subscription?.plan?.features as Record<string, boolean>) || {};
    const latestRelease = await this.prisma.release.findFirst({
      where: { tenantId },
      orderBy: { buildNumber: 'desc' },
    });

    const buildNumber = (latestRelease?.buildNumber || 0) + 1;
    const major = latestRelease ? parseInt(latestRelease.version.split('.')[0]) : 1;
    const version = `${major}.0.${buildNumber}`;

    const manifest = {
      app: {
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        version,
        buildNumber,
        publishedAt: new Date().toISOString(),
      },
      theme: tenant.theme || {
        primaryColor: '#0066FF',
        secondaryColor: '#00CC66',
        backgroundColor: '#FFFFFF',
        textColor: '#1A1A1A',
        fontFamily: 'Inter',
        borderRadius: '8px',
      },
      navigation: tenant.navigation?.items || [],
      config: {
        currency: tenant.config?.currency || 'NGN',
        timezone: tenant.config?.timezone || 'Africa/Lagos',
        languages: tenant.config?.languages || ['en'],
        offlinePolicy: tenant.config?.offlinePolicy || 'cache-first',
      },
      features,
      screens: tenant.pages.map((page) => ({
        name: page.name,
        slug: page.slug,
        isHome: page.isHome,
        route: `/${page.slug}`,
        blocks: page.sections.map((section) => ({
          id: section.id,
          type: section.type,
          config: section.config,
          components: section.components.map((c) => ({
            id: c.id,
            type: c.type,
            props: c.props,
          })),
        })),
      })),
    };

    const checksum = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

    await this.prisma.draft.upsert({
      where: { id: `${tenantId}-draft` },
      create: { id: `${tenantId}-draft`, tenantId, version: buildNumber, manifest: manifest as any, status: 'compiled' },
      update: { version: buildNumber, manifest: manifest as any, status: 'compiled' },
    });

    const release = await this.prisma.release.create({
      data: {
        tenantId,
        version,
        buildNumber,
        manifest: manifest as any,
        themeBundle: tenant.theme as any,
        checksum,
        status: 'draft',
        channel: 'production',
      },
    });

    return { manifest, checksum, version: release.version };
  }
}
