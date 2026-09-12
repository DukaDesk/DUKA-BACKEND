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

  async publish(tenantId: string, userId: string) {
    await this.verifyPublishingPermission(tenantId, userId);

    const validation = await this.validationEngine.validateDraft(tenantId);
    if (!validation.passed) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    const { manifest, checksum, version } = await this.manifestCompiler.compile(tenantId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });

    const release = await this.prisma.release.updateMany({
      where: { tenantId, status: 'draft' },
      data: { status: 'published', publishedAt: new Date() },
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
