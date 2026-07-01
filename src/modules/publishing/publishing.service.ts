import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
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

  async publish(tenantId: string) {
    const validation = await this.validationEngine.validateDraft(tenantId);
    if (!validation.passed) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    const { manifest, checksum, version } = await this.manifestCompiler.compile(tenantId);

    const release = await this.prisma.release.updateMany({
      where: { tenantId, status: 'draft' },
      data: { status: 'published', publishedAt: new Date() },
    });

    await this.redis.del(`manifest:${tenantId}`);

    await this.eventBus.publish({
      type: 'ReleasePublished',
      aggregateId: tenantId,
      data: { tenantId, version, checksum },
    });

    this.logger.log(`Published v${version} for tenant ${tenantId}`);

    return { message: 'Published successfully', version, checksum };
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
