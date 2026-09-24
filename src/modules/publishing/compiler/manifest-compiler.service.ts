import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import * as crypto from 'crypto';

export interface CompiledManifest {
  manifest: any;
  checksum: string;
  version: string;
  buildNumber: number;
  themeBundle?: any;
  capabilityMeta?: any;
  assetManifest?: any;
}

/**
 * Compiles draft pages into a PublishedApp-style manifest.
 * Does NOT create a Release — activation is owned by PublishingService (B2).
 */
@Injectable()
export class ManifestCompiler {
  constructor(private prisma: PrismaService) {}

  async compile(tenantId: string): Promise<CompiledManifest> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        theme: true,
        navigation: true,
        config: true,
        subscription: { include: { plan: true } },
        draftPages: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            draftSections: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                draftComponents: {
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

    if (!tenant.draftPages || tenant.draftPages.length === 0) {
      throw new BadRequestException(
        'No draft pages found. Initialize drafts before publishing.',
      );
    }

    const features = (tenant.subscription?.plan?.features as Record<string, boolean>) || {};
    const latestRelease = await this.prisma.release.findFirst({
      where: { tenantId },
      orderBy: { buildNumber: 'desc' },
    });

    const buildNumber = (latestRelease?.buildNumber || 0) + 1;
    const major = latestRelease ? parseInt(latestRelease.version.split('.')[0], 10) || 1 : 1;
    const version = `${major}.0.${buildNumber}`;

    const assetReferences: string[] = [];

    // Align draft compilation with the PublishedApp 1.0.0 contract (B2).
    const manifest = {
      manifestVersion: '1.0.0',
      version,
      publishedAt: new Date().toISOString(),
      status: 'published',
      metadata: {
        version,
        schemaVersion: '1.0',
        displayName: tenant.name,
        category: '',
        publishedAt: new Date().toISOString(),
      },
      identity: {
        slug: tenant.slug,
        displayName: tenant.name,
        logo: tenant.logo,
      },
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
      navigation: this.normalizeNavigation(tenant.navigation?.items, tenant.draftPages),
      config: {
        currency: tenant.config?.currency || 'NGN',
        timezone: tenant.config?.timezone || 'Africa/Lagos',
        languages: tenant.config?.languages || ['en'],
        offlinePolicy: tenant.config?.offlinePolicy || 'cache-first',
      },
      features,
      runtime: { version: '1.0.0' },
      // Object screen map (screenId → screen) — not the legacy array form.
      screens: this.buildScreenMap(tenant.draftPages, assetReferences),
    };

    const checksum = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

    const uniqueAssetIds = [
      ...new Set(assetReferences.filter((ref) => ref && !ref.startsWith('/'))),
    ];

    const invalidAssets: string[] = [];
    if (uniqueAssetIds.length > 0) {
      const existingMedia = await this.prisma.media.findMany({
        where: { tenantId, id: { in: uniqueAssetIds } },
        select: { id: true },
      });
      const existingIds = new Set(existingMedia.map((m) => m.id));
      invalidAssets.push(...uniqueAssetIds.filter((id) => !existingIds.has(id)));
    }

    const capabilityMeta = {
      features,
      hasNavigation: !!tenant.navigation,
      hasTheme: !!tenant.theme,
      screenCount: tenant.draftPages.length,
      manifestVersion: '1.0.0',
    };

    const assetManifest = {
      references: [...new Set(assetReferences)],
      logo: tenant.theme?.logo || tenant.logo,
      generatedAt: new Date().toISOString(),
      invalidAssets: invalidAssets.length > 0 ? invalidAssets : undefined,
    };

    // Keep a compiled draft record for operator visibility — not a Release.
    await this.prisma.draft.upsert({
      where: { id: `${tenantId}-draft` },
      create: {
        id: `${tenantId}-draft`,
        tenantId,
        version: buildNumber,
        manifest: manifest as any,
        status: 'compiled',
      },
      update: { version: buildNumber, manifest: manifest as any, status: 'compiled' },
    });

    return {
      manifest,
      checksum,
      version,
      buildNumber,
      themeBundle: tenant.theme,
      capabilityMeta,
      assetManifest,
    };
  }

  private normalizeNavigation(items: any, pages: any[]) {
    if (Array.isArray(items) && items.length > 0) {
      // Preserve merchant navigation as-is when it's already object form.
      if (typeof items[0] === 'object') return items;
      return items;
    }
    return pages.map((p) => ({ label: p.name, screenId: p.slug, path: `/${p.slug}` }));
  }

  private buildScreenMap(pages: any[], assetReferences: string[]) {
    const map: Record<string, any> = {};
    for (const page of pages) {
      const screenId = page.slug || page.id;
      map[screenId] = {
        name: page.name,
        title: page.name,
        screenId,
        isHome: page.isHome,
        route: `/${page.slug}`,
        layout: {
          kind: 'scroll',
          children: page.draftSections.map((section: any) => ({
            id: section.id,
            type: 'layout',
            key: section.id,
            layout: {
              kind: 'section',
              config: section.config,
              children: section.draftComponents.map((c: any) => {
                const props = (c.props as Record<string, any>) || {};
                if (props.assetId) assetReferences.push(props.assetId);
                if (props.imageUrl) assetReferences.push(props.imageUrl);
                // Preserve props exactly — including tapAction / actions / list attachments.
                return {
                  id: c.id,
                  type: c.type,
                  key: c.id,
                  props: c.props,
                  ...(c.actions != null ? { actions: c.actions } : {}),
                };
              }),
            },
          })),
        },
        blocks: page.draftSections.map((section: any) => ({
          id: section.id,
          type: section.type,
          config: section.config,
          components: section.draftComponents.map((c: any) => ({
            id: c.id,
            type: c.type,
            props: c.props,
          })),
        })),
      };
    }
    return map;
  }
}
