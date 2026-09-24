import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

export interface ActiveReleaseResult {
  tenantId: string;
  slug: string;
  release: {
    id: string;
    version: string;
    buildNumber: number;
    checksum: string | null;
    channel: string;
    status: string;
    publishedAt: Date;
    manifest: any;
  };
  payload: any;
}

/**
 * Single canonical reader for the active production release (B3).
 * Shared by RendererService and MobileBffService so both public paths
 * always return the same snapshot with the same release receipt.
 */
@Injectable()
export class ActiveReleaseService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async resolveTenant(identifier: string) {
    return this.prisma.tenant.findFirst({
      where: { OR: [{ id: identifier }, { slug: identifier }] },
      select: {
        id: true,
        slug: true,
        name: true,
        logo: true,
        status: true,
        activeReleaseId: true,
      },
    });
  }

  async getActiveRelease(
    identifier: string,
    opts?: { version?: string; allowNonProductionChannel?: boolean },
  ): Promise<ActiveReleaseResult> {
    const tenant = await this.resolveTenant(identifier);
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }

    if (opts?.version) {
      const release = await this.prisma.release.findFirst({
        where: {
          tenantId: tenant.id,
          version: opts.version,
          channel: opts.allowNonProductionChannel ? undefined : 'production',
          status: { not: 'draft' },
        },
        orderBy: { publishedAt: 'desc' },
      });
      if (!release?.manifest) {
        throw new NotFoundException({
          code: 'RELEASE_NOT_FOUND',
          message: `Release v${opts.version} not found`,
        });
      }
      return this.toResult(tenant, release);
    }

    const active = await this.loadActive(tenant);
    if (active) return this.toResult(tenant, active);

    // Fallback for pre-migration rows that never got activeReleaseId backfilled.
    const legacy = await this.prisma.release.findFirst({
      where: {
        tenantId: tenant.id,
        status: 'published',
        channel: 'production',
      },
      orderBy: [{ publishedAt: 'desc' }, { buildNumber: 'desc' }],
    });
    if (legacy?.manifest) {
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { activeReleaseId: legacy.id },
      }).catch(() => undefined);
      await this.cacheActiveId(tenant.id, legacy.id);
      return this.toResult(tenant, legacy);
    }

    throw new NotFoundException({
      code: 'NO_PUBLISHED_RELEASE',
      message: 'No published release for this app',
    });
  }

  /**
   * Public payload: full immutable snapshot + release receipt.
   * Both definition and BFF must use this so they stay byte-identical.
   */
  toPublicPayload(release: {
    id: string;
    version: string;
    checksum: string | null;
    publishedAt: Date;
    channel: string;
    manifest: any;
  }): any {
    const manifest = release.manifest;
    const receipt = {
      id: release.id,
      version: release.version,
      checksum: release.checksum,
      publishedAt: release.publishedAt,
      channel: release.channel,
    };
    if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
      return { ...manifest, release: receipt };
    }
    return { manifest, release: receipt };
  }

  async invalidate(tenantId: string, slug?: string): Promise<void> {
    await this.redis.del(`active:release:${tenantId}`);
    await this.redis.del(`manifest:${tenantId}`);
    if (slug) {
      await this.redis.del(`manifest:${slug}`);
      // slug-based active pointer (if we ever cache by slug)
      await this.redis.del(`active:release:slug:${slug}`);
    }
  }

  private async loadActive(tenant: { id: string; activeReleaseId: string | null }) {
    const cacheKey = `active:release:${tenant.id}`;
    let releaseId = tenant.activeReleaseId;

    if (!releaseId) {
      const cachedId = await this.redis.get(cacheKey);
      releaseId = cachedId || null;
    }

    if (releaseId) {
      const snapKey = `release:snap:${releaseId}`;
      const cachedSnap = await this.redis.get(snapKey);
      if (cachedSnap) {
        try {
          return JSON.parse(cachedSnap);
        } catch {
          await this.redis.del(snapKey);
        }
      }

      const release = await this.prisma.release.findUnique({
        where: { id: releaseId },
      });
      if (release?.manifest && release.status !== 'draft') {
        await this.redis.set(snapKey, JSON.stringify(release), 3600);
        await this.cacheActiveId(tenant.id, release.id);
        return release;
      }
    }

    return null;
  }

  private async cacheActiveId(tenantId: string, releaseId: string) {
    // Short TTL so a concurrent activation that fails to invalidate still converges.
    await this.redis.set(`active:release:${tenantId}`, releaseId, 60);
  }

  private toResult(
    tenant: { id: string; slug: string },
    release: any,
  ): ActiveReleaseResult {
    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      release: {
        id: release.id,
        version: release.version,
        buildNumber: release.buildNumber,
        checksum: release.checksum ?? null,
        channel: release.channel,
        status: release.status,
        publishedAt: release.publishedAt,
        manifest: release.manifest,
      },
      payload: this.toPublicPayload(release),
    };
  }
}
