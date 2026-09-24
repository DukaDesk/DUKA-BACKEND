import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { ValidationEngine } from './validation/validation-engine.service';
import { ManifestCompiler } from './compiler/manifest-compiler.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { ActiveReleaseService } from '../../shared/releases/active-release.service';
import { ManifestValidator } from './manifest-validator.service';
import * as crypto from 'crypto';

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private validationEngine: ValidationEngine,
    private manifestCompiler: ManifestCompiler,
    private eventBus: EventBusService,
    private releases: ActiveReleaseService,
  ) {}

  async validate(tenantId: string, userId?: string) {
    if (userId) await this.verifyPublishingPermission(tenantId, userId);
    return this.validationEngine.validateDraft(tenantId);
  }

  /**
   * Publish either a client-compiled PublishedApp (B1) or drafts (legacy).
   * Activation is one transaction that supersedes the prior release, inserts
   * the new immutable release, and points tenant.activeReleaseId at it (B2).
   */
  async publish(
    tenantId: string,
    userId: string,
    body?: { manifest?: any; version?: string; idempotencyKey?: string },
  ) {
    await this.verifyPublishingPermission(tenantId, userId);

    const idemKey = body?.idempotencyKey;
    if (idemKey) {
      const cached = await this.redis.get(this.idemKey(tenantId, idemKey));
      if (cached) {
        this.logger.log(`Publish idempotent replay for tenant ${tenantId}`);
        return JSON.parse(cached);
      }
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    let result: any;

    if (body?.manifest !== undefined && body?.manifest !== null) {
      result = await this.publishClientManifest(tenantId, tenant.slug, {
        manifest: body.manifest,
        version: body.version,
      });
    } else {
      result = await this.publishFromDrafts(tenantId, tenant.slug);
    }

    // B7: reconcile tenant status only after durable activation.
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'published', publishedAt: new Date() },
    });

    await this.releases.invalidate(tenantId, tenant.slug);

    this.eventBus.publish({
      type: 'ReleasePublished',
      aggregateId: tenantId,
      data: {
        tenantId,
        version: result.version,
        releaseId: result.releaseId,
        checksum: result.checksum,
      },
    });

    if (idemKey) {
      await this.redis.set(this.idemKey(tenantId, idemKey), JSON.stringify(result), 86400);
    }

    this.logger.log(
      `Published v${result.version} (${result.releaseId}) for tenant ${tenantId}`,
    );
    return result;
  }

  private async publishClientManifest(
    tenantId: string,
    slug: string,
    body: { manifest: any; version?: string },
  ) {
    // B1: invalid manifest → 422, never fall through to draft compilation.
    const manifest = ManifestValidator.assertValid(body.manifest, {
      requestedVersion: body.version,
    });

    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(manifest))
      .digest('hex');

    const { version, buildNumber } = await this.allocateVersion(tenantId, checksum, body.version);

    return this.activateRelease({
      tenantId,
      slug,
      version,
      buildNumber,
      manifest,
      checksum,
      themeBundle: manifest.theme ?? null,
      capabilityMeta: {
        screenCount: this.countScreens(manifest.screens),
        manifestVersion: manifest.manifestVersion ?? '1.0.0',
      },
      assetManifest: this.buildAssetManifest(manifest),
    });
  }

  private async publishFromDrafts(tenantId: string, slug: string) {
    const validation = await this.validationEngine.validateDraft(tenantId);
    if (!validation.passed) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    // Compiler no longer creates a competing draft Release (B2).
    const compiled = await this.manifestCompiler.compile(tenantId);

    return this.activateRelease({
      tenantId,
      slug,
      version: compiled.version,
      buildNumber: compiled.buildNumber,
      manifest: compiled.manifest,
      checksum: compiled.checksum,
      themeBundle: compiled.themeBundle ?? null,
      capabilityMeta: compiled.capabilityMeta ?? null,
      assetManifest: compiled.assetManifest ?? null,
    });
  }

  /**
   * One atomic activation: supersede previous published → insert immutable
   * release → set tenant.activeReleaseId. Draft rows are retained (B2 policy:
   * drafts stay editable after publish; publishing is the deploy boundary).
   */
  private async activateRelease(input: {
    tenantId: string;
    slug: string;
    version: string;
    buildNumber: number;
    manifest: any;
    checksum: string;
    themeBundle?: any;
    capabilityMeta?: any;
    assetManifest?: any;
  }): Promise<any> {
    const { tenantId, version, buildNumber, manifest, checksum } = input;

    try {
      const release = await this.prisma.$transaction(async (tx) => {
        await tx.release.updateMany({
          where: { tenantId, status: 'published', channel: 'production' },
          data: { status: 'superseded' },
        });

        const created = await tx.release.create({
          data: {
            tenantId,
            version,
            buildNumber,
            manifest: manifest as any,
            themeBundle: input.themeBundle ?? undefined,
            capabilityMeta: input.capabilityMeta ?? undefined,
            assetManifest: input.assetManifest ?? undefined,
            checksum,
            status: 'published',
            channel: 'production',
            publishedAt: new Date(),
          },
        });

        await tx.tenant.update({
          where: { id: tenantId },
          data: { activeReleaseId: created.id, draftVersion: 0 },
        });

        return created;
      });

      return {
        message: 'Published successfully',
        releaseId: release.id,
        tenantId,
        channel: release.channel,
        version: release.version,
        buildNumber: release.buildNumber,
        checksum: release.checksum,
        publishedAt: release.publishedAt,
      };
    } catch (err: any) {
      // Unique tenantId/version race — recover if our bytes already landed (idempotent retry).
      if (err?.code === 'P2002') {
        const existing = await this.prisma.release.findFirst({
          where: { tenantId, version },
        });
        if (existing && existing.checksum === checksum) {
          await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { activeReleaseId: existing.id },
          });
          return {
            message: 'Published successfully',
            releaseId: existing.id,
            tenantId,
            channel: existing.channel,
            version: existing.version,
            buildNumber: existing.buildNumber,
            checksum: existing.checksum,
            publishedAt: existing.publishedAt,
          };
        }
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: `Version ${version} already exists with different content`,
        });
      }
      throw err;
    }
  }

  private async allocateVersion(
    tenantId: string,
    checksum: string,
    requested?: string,
  ): Promise<{ version: string; buildNumber: number }> {
    const latest = await this.prisma.release.findFirst({
      where: { tenantId },
      orderBy: { buildNumber: 'desc' },
    });
    const buildNumber = (latest?.buildNumber || 0) + 1;
    const major = latest ? parseInt(latest.version.split('.')[0], 10) || 1 : 1;

    if (requested) {
      const clash = await this.prisma.release.findUnique({
        where: { tenantId_version: { tenantId, version: requested } },
      });
      if (clash) {
        if (clash.checksum === checksum) {
          // Same bytes already stored — activate path will reconcile.
          return { version: requested, buildNumber: clash.buildNumber };
        }
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: `Version ${requested} already exists`,
        });
      }
      return { version: requested, buildNumber };
    }

    return { version: `${major}.0.${buildNumber}`, buildNumber };
  }

  private countScreens(screens: any): number {
    if (!screens) return 0;
    if (Array.isArray(screens)) return screens.length;
    if (typeof screens === 'object') return Object.keys(screens).length;
    return 0;
  }

  private buildAssetManifest(manifest: any) {
    const refs = new Set<string>();
    const walk = (node: any, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 30) return;
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, depth + 1));
        return;
      }
      if (node.assetId) refs.add(String(node.assetId));
      if (node.imageUrl && typeof node.imageUrl === 'string') refs.add(node.imageUrl);
      const src = node.props?.source;
      if (src && typeof src === 'object' && src.assetId) refs.add(String(src.assetId));
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object') walk(value, depth + 1);
      }
    };
    walk(manifest);
    return {
      references: [...refs],
      logo:
        manifest?.theme?.brand?.logo ??
        manifest?.identity?.logo ??
        manifest?.assets?.logo?.url ??
        null,
      generatedAt: new Date().toISOString(),
    };
  }

  private idemKey(tenantId: string, key: string) {
    return `idem:publish:${tenantId}:${key}`;
  }

  private async verifyPublishingPermission(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      throw new ForbiddenException({
        code: 'NOT_OWNER',
        message: 'Only tenant owners and managers can publish',
      });
    }
    if (membership.status !== 'active') {
      throw new ForbiddenException({
        code: 'MEMBERSHIP_INACTIVE',
        message: 'Membership is not active',
      });
    }
  }

  async getReleaseHistory(tenantId: string, userId: string) {
    await this.verifyPublishingPermission(tenantId, userId);
    return this.prisma.release.findMany({
      where: { tenantId },
      orderBy: { buildNumber: 'desc' },
      select: {
        id: true,
        version: true,
        buildNumber: true,
        status: true,
        channel: true,
        releaseNotes: true,
        checksum: true,
        publishedAt: true,
      },
    });
  }

  async getRelease(tenantId: string, version: string, userId: string) {
    await this.verifyPublishingPermission(tenantId, userId);
    const release = await this.prisma.release.findUnique({
      where: { tenantId_version: { tenantId, version } },
    });
    if (!release || release.status === 'draft') {
      // Never expose private drafts on the recovery read path (B3/B5).
      throw new NotFoundException('Release not found');
    }
    return release;
  }

  async rollback(tenantId: string, targetVersion: string, userId: string) {
    // B5: owner/manager membership required — controller now supplies userId.
    await this.verifyPublishingPermission(tenantId, userId);

    const target = await this.prisma.release.findUnique({
      where: { tenantId_version: { tenantId, version: targetVersion } },
    });
    if (!target || target.status === 'draft' || !target.manifest) {
      throw new NotFoundException('Target release not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });

    const previous = await this.prisma.release.findFirst({
      where: { tenantId, status: 'published', channel: 'production' },
      orderBy: [{ publishedAt: 'desc' }, { buildNumber: 'desc' }],
    });

    await this.prisma.$transaction(async (tx) => {
      if (previous && previous.id !== target.id) {
        await tx.release.update({
          where: { id: previous.id },
          data: { status: 'rolled_back' },
        });
      }
      await tx.release.update({
        where: { id: target.id },
        data: { status: 'published', publishedAt: new Date(), channel: 'production' },
      });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { activeReleaseId: target.id },
      });
    });

    await this.releases.invalidate(tenantId, tenant?.slug);

    this.eventBus.publish({
      type: 'RollbackCompleted',
      aggregateId: tenantId,
      data: {
        tenantId,
        fromVersion: previous?.version,
        toVersion: targetVersion,
        releaseId: target.id,
      },
    });

    return {
      message: `Rolled back to v${targetVersion}`,
      releaseId: target.id,
      version: target.version,
      checksum: target.checksum,
    };
  }

  async getCurrentDraft(tenantId: string, userId: string) {
    await this.verifyPublishingPermission(tenantId, userId);
    return this.prisma.draft.findUnique({
      where: { id: `${tenantId}-draft` },
    });
  }
}
