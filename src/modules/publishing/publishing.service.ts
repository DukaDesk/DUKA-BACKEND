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
import { CompatibilityService } from '../../shared/compatibility/compatibility.service';
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
    private compatibility: CompatibilityService,
  ) {}

  async validate(tenantId: string, userId?: string) {
    if (userId) await this.verifyPublishingPermission(tenantId, userId);
    return this.validationEngine.validateDraft(tenantId);
  }

  /**
   * B7 merchant preflight — validate a manifest (or the current drafts)
   * against the runtime compatibility contract without publishing anything.
   * Always returns HTTP 200 with a report; `compatible: false` lists exactly
   * what would block activation.
   */
  async preflight(
    tenantId: string,
    userId: string,
    body?: { manifest?: any },
  ) {
    await this.verifyPublishingPermission(tenantId, userId);

    let manifest: any;
    let source: 'manifest' | 'draft';
    if (body?.manifest !== undefined && body?.manifest !== null) {
      manifest = body.manifest;
      source = 'manifest';
    } else {
      const compiled = await this.manifestCompiler.compile(tenantId, { persist: false });
      manifest = compiled.manifest;
      source = 'draft';
    }

    const structural = ManifestValidator.validate(manifest);
    const compat = await this.compatibility.evaluate(manifest, { tenantId });

    return {
      contract: compat.contract,
      source,
      valid: structural.valid,
      compatible: structural.valid && compat.compatible,
      errors: [...(structural.valid ? [] : structural.errors), ...compat.errors],
      warnings: compat.warnings,
      counts: compat.counts,
      checkedAt: compat.checkedAt,
    };
  }

  /** Save the exact client snapshot for admin preview and create an immutable
   * private release candidate. Neither operation changes the active release. */
  async submitForReview(tenantId: string, userId: string, submittedManifest: any) {
    await this.verifyPublishingPermission(tenantId, userId);
    const manifest = ManifestValidator.assertValid(submittedManifest);
    const compat = await this.compatibility.assertCompatible(manifest, { tenantId });

    const release = await this.publishClientManifest(tenantId, {
      manifest,
      version: manifest.version,
    });
    const { manifest: versionedManifest, ...releaseResult } = release;
    const checksum = releaseResult.checksum;
    if (release.status !== 'pending_review' && release.status !== 'published') {
      throw new ConflictException({
        code: 'VERSION_ALREADY_REVIEWED',
        message: `Version ${release.version} was already reviewed; increment the version before resubmitting`,
      });
    }
    const savedDraft = await this.prisma.draft.upsert({
      where: { id: `${tenantId}-draft` },
      create: { id: `${tenantId}-draft`, tenantId, version: 1, manifest: versionedManifest, status: 'in_review' },
      update: { version: { increment: 1 }, manifest: versionedManifest, status: 'in_review' },
    });
    if (release.status === 'pending_review') {
      await this.supersedePendingCandidates(tenantId, release.releaseId);
      await this.markSubmittedForReview(tenantId);
      this.eventBus.publish({
        type: 'ReleaseSubmittedForReview',
        aggregateId: tenantId,
        data: {
          tenantId,
          version: release.version,
          releaseId: release.releaseId,
          checksum,
          status: 'pending_review',
        },
      });
    }

    return {
      ...releaseResult,
      status: release.status === 'published' ? 'published' : 'in_review',
      checksum,
      submittedAt: savedDraft.updatedAt,
      compatibility: { contract: compat.contract, warnings: compat.warnings },
    };
  }

  /** Compile the saved drafts, then stage that exact snapshot for admin review. */
  async submitDraftsForReview(tenantId: string, userId: string) {
    await this.verifyPublishingPermission(tenantId, userId);

    const validation = await this.validationEngine.validateDraft(tenantId);
    if (!validation.passed) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    const compiled = await this.manifestCompiler.compile(tenantId, { persist: false });
    return this.submitForReview(tenantId, userId, compiled.manifest);
  }

  /** Store a private candidate. Public activation is reserved for
   * publishAsAdmin after app review approval. */
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
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    let result: any;

    if (body?.manifest !== undefined && body?.manifest !== null) {
      const manifest = body.version && body.manifest?.version !== body.version
        ? { ...body.manifest, version: body.version }
        : body.manifest;
      result = await this.submitForReview(tenantId, userId, manifest);
    } else {
      result = await this.submitDraftsForReview(tenantId, userId);
    }

    if (idemKey) {
      await this.redis.set(this.idemKey(tenantId, idemKey), JSON.stringify(result), 86400);
    }

    this.logger.log(
      `Submitted v${result.version} (${result.releaseId}) for review for tenant ${tenantId}`,
    );
    return result;
  }

  /** Activate the exact candidate that an administrator reviewed. */
  async publishAsAdmin(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    // The release is the immutable submitted artifact. The editable draft may
    // have changed since submission and must never replace what was reviewed.
    const candidate = await this.prisma.release.findFirst({
      where: { tenantId, status: 'pending_review' },
      orderBy: { buildNumber: 'desc' },
    });
    if (!candidate?.manifest) {
      throw new ConflictException('No app submission is awaiting review');
    }

    const result = await this.activateReviewRelease(tenantId, tenant.slug, candidate.id);
    this.logger.log(`Admin-approved publish v${result.version} (${result.releaseId}) for tenant ${tenantId}`);
    return result;
  }

  private async activateReviewRelease(tenantId: string, slug: string, releaseId: string) {
    const candidate = await this.prisma.release.findFirst({
      where: { id: releaseId, tenantId, status: { in: ['pending_review', 'published'] } },
    });
    if (!candidate?.manifest) throw new NotFoundException('Submitted release candidate not found');

    const publishedAt = new Date();
    const release = await this.prisma.$transaction(async (tx) => {
      await tx.release.updateMany({
        where: { tenantId, status: 'published', channel: 'production', id: { not: candidate.id } },
        data: { status: 'superseded' },
      });
      await tx.release.updateMany({
        where: { tenantId, status: 'pending_review', id: { not: candidate.id } },
        data: { status: 'superseded' },
      });
      const approved = candidate.status === 'published'
        ? candidate
        : await tx.release.update({
            where: { id: candidate.id },
            data: { status: 'published', channel: 'production', publishedAt },
          });
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          status: 'published',
          publishedAt,
          activeReleaseId: approved.id,
          appStatus: 'approved',
          appReviewedAt: publishedAt,
          appReviewNote: null,
        },
      });
      return approved;
    });

    await this.releases.invalidate(tenantId, slug);
    this.eventBus.publish({
      type: 'ReleasePublished',
      aggregateId: tenantId,
      data: { tenantId, version: release.version, releaseId: release.id, checksum: release.checksum },
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
  }

  private async publishClientManifest(
    tenantId: string,
    body: { manifest: any; version?: string },
  ) {
    // B1: invalid manifest → 422, never fall through to draft compilation.
    const submittedManifest = ManifestValidator.assertValid(body.manifest, {
      requestedVersion: body.version,
    });

    // B7: reject anything the shell cannot render before allocating a version.
    const compat = await this.compatibility.assertCompatible(submittedManifest, { tenantId });
    const { version, buildNumber, manifest, checksum } = await this.allocateVersion(
      tenantId,
      submittedManifest,
      body.version,
    );

    const submitted = await this.createReviewRelease({
      tenantId,
      version,
      buildNumber,
      manifest,
      checksum,
      themeBundle: manifest.theme ?? null,
      capabilityMeta: {
        screenCount: this.countScreens(manifest.screens),
        manifestVersion: manifest.manifestVersion ?? '1.0.0',
        contract: compat.contract,
      },
      assetManifest: this.buildAssetManifest(manifest),
    });

    return {
      ...submitted,
      manifest,
      compatibility: { contract: compat.contract, warnings: compat.warnings },
    };
  }

  private async markSubmittedForReview(tenantId: string) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        appStatus: 'in_review',
        appSubmittedAt: new Date(),
        appReviewNote: null,
      },
    });
  }

  /** Only the newest submission should be actionable; superseded candidates
   * must never be activated by a later admin approval. */
  private async supersedePendingCandidates(tenantId: string, keepReleaseId: string) {
    await this.prisma.release.updateMany({
      where: {
        tenantId,
        status: 'pending_review',
        id: { not: keepReleaseId },
      },
      data: { status: 'superseded' },
    });
  }

  /**
   * A merchant submission is immutable but not publicly active until an admin
   * approves it. Existing live releases remain available during review.
   */
  private async createReviewRelease(input: {
    tenantId: string;
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
      const release = await this.prisma.release.create({
        data: {
          tenantId,
          version,
          buildNumber,
          manifest: manifest as any,
          themeBundle: input.themeBundle ?? undefined,
          capabilityMeta: input.capabilityMeta ?? undefined,
          assetManifest: input.assetManifest ?? undefined,
          checksum,
          status: 'pending_review',
          channel: 'production',
          publishedAt: new Date(),
        },
      });

      return {
        message: 'Submitted for admin review',
        status: release.status,
        releaseId: release.id,
        tenantId,
        channel: release.channel,
        version: release.version,
        buildNumber: release.buildNumber,
        checksum: release.checksum,
        publishedAt: release.publishedAt,
        manifest,
      };
    } catch (err: any) {
      // Unique tenantId/version race — recover if our bytes already landed (idempotent retry).
      if (err?.code === 'P2002') {
        const existing = await this.prisma.release.findFirst({
          where: { tenantId, version },
        });
        if (existing && existing.checksum === checksum) {
          return {
            message: existing.status === 'published' ? 'Already approved' : 'Already submitted for admin review',
            status: existing.status,
            releaseId: existing.id,
            tenantId,
            channel: existing.channel,
            version: existing.version,
            buildNumber: existing.buildNumber,
            checksum: existing.checksum,
            publishedAt: existing.publishedAt,
            manifest: existing.manifest,
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
    submittedManifest: any,
    requested?: string,
  ): Promise<{ version: string; buildNumber: number; manifest: any; checksum: string }> {
    const latest = await this.prisma.release.findFirst({
      where: { tenantId },
      orderBy: { buildNumber: 'desc' },
    });
    const buildNumber = (latest?.buildNumber || 0) + 1;
    const nextVersion = latest ? this.incrementPatchVersion(latest.version) : '1.0.0';
    const requestedVersion = requested ?? submittedManifest.version;
    const version = requestedVersion || nextVersion;

    if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
      throw new BadRequestException('App version must use semantic version format MAJOR.MINOR.PATCH');
    }

    const clash = await this.prisma.release.findUnique({
      where: { tenantId_version: { tenantId, version } },
    });
    const manifest = {
      ...submittedManifest,
      version,
      ...(submittedManifest.metadata
        ? { metadata: { ...submittedManifest.metadata, version } }
        : {}),
      ...(submittedManifest.app
        ? { app: { ...submittedManifest.app, version, buildNumber: clash?.buildNumber ?? buildNumber } }
        : {}),
    };
    const checksum = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

    if (clash) {
      if (clash.checksum === checksum) {
        // Same bytes already stored — activation path can reconcile it.
        return { version, buildNumber: clash.buildNumber, manifest, checksum };
      }
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: `Version ${version} already exists with different content`,
      });
    }

    if (latest && version !== nextVersion) {
      throw new ConflictException({
        code: 'VERSION_SEQUENCE',
        message: `The next app version must be ${nextVersion}`,
        expectedVersion: nextVersion,
      });
    }

    return { version, buildNumber, manifest, checksum };
  }

  private incrementPatchVersion(version: string): string {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match) {
      throw new ConflictException({
        code: 'INVALID_STORED_VERSION',
        message: `Stored app version "${version}" is not MAJOR.MINOR.PATCH`,
      });
    }
    return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
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
        message: 'Only merchant owners and managers can publish',
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

  async getSubmissionStatus(tenantId: string, userId: string) {
    await this.verifyPublishingPermission(tenantId, userId);
    const [tenant, latest] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          activeReleaseId: true,
          appStatus: true,
          appReviewNote: true,
          appSubmittedAt: true,
        },
      }),
      this.prisma.release.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, version: true, status: true, releaseNotes: true, capabilityMeta: true, createdAt: true },
      }),
    ]);
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    const status = tenant.appStatus === 'in_review'
      ? 'in_review'
      : tenant.appStatus === 'rejected'
        ? 'rejected'
        : latest?.status === 'pending_review'
          ? 'in_review'
          : latest?.status === 'rejected'
            ? 'rejected'
            : latest && latest.id === tenant.activeReleaseId && latest.status === 'published'
              ? 'live'
              : tenant.activeReleaseId
                ? 'live'
                : 'draft';
    return {
      status,
      appStatus: tenant.appStatus,
      reviewNote: tenant.appReviewNote,
      submittedAt: tenant.appSubmittedAt,
      release: latest
        ? {
            ...latest,
            rollbackFrom: (latest.capabilityMeta as any)?.rollbackFrom,
            releaseNotes: latest.releaseNotes || tenant.appReviewNote,
          }
        : null,
      activeReleaseId: tenant.activeReleaseId,
    };
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
    await this.verifyPublishingPermission(tenantId, userId);

    const target = await this.prisma.release.findUnique({
      where: { tenantId_version: { tenantId, version: targetVersion } },
    });
    if (!target || !['published', 'superseded', 'rolled_back'].includes(target.status) || !target.manifest) {
      throw new NotFoundException('Target release not found');
    }

    const manifest = JSON.parse(JSON.stringify(target.manifest));
    delete manifest.version;
    const allocation = await this.allocateVersion(tenantId, manifest);
    const versionedManifest = allocation.manifest;
    const compat = await this.compatibility.assertCompatible(versionedManifest, { tenantId });
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

    const submission = await this.createReviewRelease({
      tenantId,
      version: allocation.version,
      buildNumber: allocation.buildNumber,
      manifest: versionedManifest,
      checksum: allocation.checksum,
      themeBundle: versionedManifest.theme ?? null,
      capabilityMeta: { ...((target.capabilityMeta as any) || {}), rollbackFrom: target.version, contract: compat.contract },
      assetManifest: target.assetManifest ?? this.buildAssetManifest(versionedManifest),
    });

    await this.prisma.draft.upsert({
      where: { id: `${tenantId}-draft` },
      create: { id: `${tenantId}-draft`, tenantId, version: 1, manifest: versionedManifest, status: 'in_review' },
      update: { version: { increment: 1 }, manifest: versionedManifest, status: 'in_review' },
    });
    await this.supersedePendingCandidates(tenantId, submission.releaseId);
    await this.markSubmittedForReview(tenantId);

    this.eventBus.publish({
      type: 'ReleaseSubmittedForReview',
      aggregateId: tenantId,
      data: {
        tenantId,
        fromVersion: target.version,
        version: submission.version,
        releaseId: submission.releaseId,
        status: 'pending_review',
      },
    });

    return { ...submission, message: `Rollback of v${targetVersion} submitted for admin review`, rollbackFrom: target.version };
  }

  async getCurrentDraft(tenantId: string, userId: string) {
    await this.verifyPublishingPermission(tenantId, userId);
    return this.prisma.draft.findUnique({
      where: { id: `${tenantId}-draft` },
    });
  }
}
