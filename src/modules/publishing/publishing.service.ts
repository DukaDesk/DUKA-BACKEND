import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { ValidationEngine } from './validation/validation-engine.service';
import { ManifestCompiler } from './compiler/manifest-compiler.service';
import { EventBusService } from '../../shared/events/event-bus.service';

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private validationEngine: ValidationEngine,
    private manifestCompiler: ManifestCompiler,
    private eventBus: EventBusService,
  ) {}

  async validate(tenantId: string) {
    return this.validationEngine.validateDraft(tenantId);
  }

  async publish(tenantId: string, userId: string, body?: { manifest?: any; version?: string }) {
    await this.verifyPublishingPermission(tenantId, userId);

    let manifest: any;
    let checksum: string;
    let version: string;

    if (body?.manifest && body.manifest.screens && Array.isArray(body.manifest.screens) && body.manifest.screens.length > 0) {
      manifest = body.manifest;
      const crypto = await import('crypto');
      checksum = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

      const latestRelease = await this.prisma.release.findFirst({
        where: { tenantId },
        orderBy: { buildNumber: 'desc' },
      });
      const buildNumber = (latestRelease?.buildNumber || 0) + 1;
      const major = latestRelease ? parseInt(latestRelease.version.split('.')[0]) : 1;
      version = body.version || `${major}.0.${buildNumber}`;

      this.logger.log(`Publishing client-compiled manifest v${version} for tenant ${tenantId}`);
    } else {
      const validation = await this.validationEngine.validateDraft(tenantId);
      if (!validation.passed) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: validation.errors,
        });
      }

      const compiled = await this.manifestCompiler.compile(tenantId);
      manifest = compiled.manifest;
      checksum = compiled.checksum;
      version = compiled.version;
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });

    const latestRelease = await this.prisma.release.findFirst({
      where: { tenantId },
      orderBy: { buildNumber: 'desc' },
    });
    const buildNumber = (latestRelease?.buildNumber || 0) + 1;

    const release = await this.prisma.release.create({
      data: {
        tenantId,
        version,
        buildNumber,
        manifest: manifest as any,
        checksum,
        status: 'published',
        publishedAt: new Date(),
        channel: 'production',
      },
    });

    await this.prisma.draftComponent.deleteMany({
      where: { draftSection: { draftPage: { tenantId } } },
    });
    await this.prisma.draftSection.deleteMany({
      where: { draftPage: { tenantId } },
    });
    await this.prisma.draftPage.deleteMany({ where: { tenantId } });
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { draftVersion: 0 },
    });

    await this.redis.del(`manifest:${tenantId}`);
    if (tenant?.slug) {
      await this.redis.del(`manifest:${tenant.slug}`);
    }

    await this.eventBus.publish({
      type: 'ReleasePublished',
      aggregateId: tenantId,
      data: { tenantId, version, checksum },
    });

    this.logger.log(`Published v${version} for tenant ${tenantId}`);

    return { message: 'Published successfully', version, checksum };
  }

  private async verifyPublishingPermission(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Only tenant owners and managers can publish' });
    }
  }

  async getReleaseHistory(tenantId: string) {
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

  async getRelease(tenantId: string, version: string) {
    const release = await this.prisma.release.findUnique({
      where: { tenantId_version: { tenantId, version } },
    });
    if (!release) throw new NotFoundException('Release not found');
    return release;
  }

  async rollback(tenantId: string, targetVersion: string) {
    const target = await this.prisma.release.findUnique({
      where: { tenantId_version: { tenantId, version: targetVersion } },
    });
    if (!target) throw new NotFoundException('Target release not found');

    const currentRelease = await this.prisma.release.findFirst({
      where: { tenantId, status: 'published' },
      orderBy: { publishedAt: 'desc' },
    });

    if (currentRelease) {
      await this.prisma.release.update({
        where: { id: currentRelease.id },
        data: { status: 'rolled_back' },
      });
    }

    await this.prisma.release.update({
      where: { id: target.id },
      data: { status: 'published', publishedAt: new Date() },
    });

    await this.redis.del(`manifest:${tenantId}`);

    await this.eventBus.publish({
      type: 'RollbackCompleted',
      aggregateId: tenantId,
      data: { tenantId, fromVersion: currentRelease?.version, toVersion: targetVersion },
    });

    return { message: `Rolled back to v${targetVersion}` };
  }

  async getCurrentDraft(tenantId: string) {
    return this.prisma.draft.findUnique({
      where: { id: `${tenantId}-draft` },
    });
  }
}
