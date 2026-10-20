import * as crypto from 'crypto';
import { PublishingService } from './publishing.service';
import { ManifestValidator } from './manifest-validator.service';
import { CompatibilityService } from '../../shared/compatibility/compatibility.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

const fixtureManifest = {
  manifestVersion: '1.0.0',
  version: '1.2.3',
  identity: { slug: 'published-fixture', displayName: 'Published Fixture' },
  navigation: {
    initialScreen: 'home',
    tabs: [{ id: 'home-tab', screenId: 'home', label: 'Home' }],
  },
  splash: { enabled: true, durationMs: 1200, screen: { screenId: '__published_splash__' } },
  theme: { brand: { name: 'Published Fixture', logo: '/uploads/logo.webp' } },
  screens: {
    home: {
      name: 'Home',
      screenId: 'home',
      layout: {
        kind: 'scroll',
        children: [
          {
            type: 'button',
            props: {
              label: 'Details',
              tapAction: { type: 'navigate', payload: { screenId: 'details' } },
            },
            categories: [
              { id: 'c1', tapAction: { type: 'navigate', payload: { screenId: 'home' } } },
              { id: 'c2', tapAction: { type: 'navigate', payload: { screenId: 'details' } } },
            ],
          },
        ],
      },
    },
    details: { name: 'Details', screenId: 'details', layout: { kind: 'scroll', children: [] } },
  },
};

function createService(overrides: Partial<Record<string, any>> = {}) {
  const prisma: any = {
    tenantUser: { findUnique: jest.fn().mockResolvedValue({ role: 'owner', status: 'active' }) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ slug: 'published-fixture' }),
      findFirst: jest.fn().mockResolvedValue({ id: 't1', slug: 'published-fixture' }),
      update: jest.fn().mockResolvedValue({}),
    },
    release: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'rel-1', publishedAt: new Date(), channel: 'production', ...data }),
      ),
    },
    draftPage: { deleteMany: jest.fn() },
    draftSection: { deleteMany: jest.fn() },
    draftComponent: { deleteMany: jest.fn() },
    draft: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        id: 't1-draft',
        status: 'in_review',
        manifest: fixtureManifest,
        updatedAt: new Date(),
      }),
    },
    media: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    ...overrides,
  };

  const redis: any = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const validationEngine: any = {
    validateDraft: jest.fn().mockResolvedValue({ passed: true, errors: [], warnings: [] }),
  };

  const manifestCompiler: any = {
    compile: jest.fn().mockResolvedValue({
      manifest: fixtureManifest,
      checksum: 'draft-checksum',
      version: '1.0.7',
      buildNumber: 7,
    }),
  };

  const eventBus: any = { publish: jest.fn() };
  const releases: any = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const compatibility = new CompatibilityService(prisma);

  const service = new PublishingService(
    prisma,
    redis,
    validationEngine,
    manifestCompiler,
    eventBus,
    releases,
    compatibility,
  );

  return {
    service,
    prisma,
    redis,
    validationEngine,
    manifestCompiler,
    eventBus,
    releases,
    compatibility,
  };
}

describe('PublishingService', () => {
  describe('B1 — client manifest path', () => {
    it('defaults the first app version to 1.0.0 and synchronizes manifest version fields', async () => {
      const { service, prisma } = createService();
      const manifest = {
        ...fixtureManifest,
        version: undefined,
        metadata: { version: '0.0.1', schemaVersion: '1.0' },
        app: { version: '0.0.1' },
      };

      const result = await service.publish('t1', 'u1', { manifest });
      const stored = prisma.release.create.mock.calls[0][0].data.manifest;

      expect(result.version).toBe('1.0.0');
      expect(stored).toMatchObject({
        version: '1.0.0',
        metadata: { version: '1.0.0' },
        app: { version: '1.0.0', buildNumber: 1 },
      });
      expect(prisma.draft.upsert.mock.calls[0][0].create.manifest).toEqual(stored);
    });

    it('increments the latest release patch version on every new submission', async () => {
      const { service, prisma } = createService();
      prisma.release.findFirst.mockResolvedValueOnce({
        version: '2.4.9',
        buildNumber: 8,
      });
      const manifest = {
        ...fixtureManifest,
        version: '2.4.10',
        metadata: { version: '2.4.9', schemaVersion: '1.0' },
        app: { version: '2.4.9' },
      };

      const result = await service.publish('t1', 'u1', { manifest });
      const stored = prisma.release.create.mock.calls[0][0].data.manifest;

      expect(result).toMatchObject({ version: '2.4.10', buildNumber: 9 });
      expect(stored).toMatchObject({
        version: '2.4.10',
        metadata: { version: '2.4.10' },
        app: { version: '2.4.10', buildNumber: 9 },
      });
    });

    it('rejects a stale requested app version instead of publishing a duplicate', async () => {
      const { service, prisma } = createService();
      prisma.release.findFirst.mockResolvedValueOnce({
        version: '1.0.2',
        buildNumber: 3,
      });

      await expect(
        service.publish('t1', 'u1', { manifest: { ...fixtureManifest, version: '1.0.2' } }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'VERSION_SEQUENCE', expectedVersion: '1.0.3' }),
      });
      expect(prisma.release.create).not.toHaveBeenCalled();
    });

    it('persists the submitted PublishedApp without invoking the compiler', async () => {
      const { service, manifestCompiler, prisma } = createService();

      const result = await service.publish('t1', 'u1', { manifest: fixtureManifest });

      expect(manifestCompiler.compile).not.toHaveBeenCalled();
      expect(prisma.release.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.release.create.mock.calls[0][0];
      expect(createArgs.data.status).toBe('pending_review');
      // Object screens preserved exactly
      expect(createArgs.data.manifest.screens).toEqual(fixtureManifest.screens);
      expect(Array.isArray(createArgs.data.manifest.screens)).toBe(false);
      expect(result).toMatchObject({
        releaseId: 'rel-1',
        tenantId: 't1',
        channel: 'production',
        status: 'in_review',
        version: expect.any(String),
        checksum: expect.any(String),
      });
    });

    it('preserves splash + navigation + tapAction through publish', async () => {
      const { service, prisma } = createService();
      await service.publish('t1', 'u1', { manifest: fixtureManifest });
      const stored = prisma.release.create.mock.calls[0][0].data.manifest;
      expect(stored.splash.durationMs).toBe(1200);
      expect(stored.navigation.initialScreen).toBe('home');
      const child = stored.screens.home.layout.children[0];
      expect(child.props.tapAction.payload.screenId).toBe('details');
      expect(child.categories.map((c: any) => c.tapAction.payload.screenId)).toEqual([
        'home',
        'details',
      ]);
    });

    it('returns 422 and does not fall through to draft compilation for invalid manifest', async () => {
      const { service, manifestCompiler, prisma } = createService();

      await expect(
        service.publish('t1', 'u1', { manifest: { screens: {} } }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(manifestCompiler.compile).not.toHaveBeenCalled();
      expect(prisma.release.create).not.toHaveBeenCalled();
    });

    it('rejects non-members', async () => {
      const { service, prisma } = createService();
      (prisma.tenantUser.findUnique as jest.Mock).mockResolvedValue({
        role: 'staff',
        status: 'active',
      });
      await expect(service.publish('t1', 'u1', { manifest: fixtureManifest })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.release.create).not.toHaveBeenCalled();
    });

    it('refuses to silently resubmit an already reviewed version', async () => {
      const { service, prisma } = createService();
      const checksum = crypto.createHash('sha256').update(JSON.stringify(fixtureManifest)).digest('hex');
      const existing = {
        id: 'old-release',
        tenantId: 't1',
        version: fixtureManifest.version,
        buildNumber: 1,
        checksum,
        status: 'rejected',
        channel: 'production',
        manifest: fixtureManifest,
        publishedAt: new Date(),
      };
      prisma.release.findUnique.mockResolvedValueOnce(existing);
      prisma.release.create.mockRejectedValueOnce({ code: 'P2002' });
      prisma.release.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing);

      await expect(service.publish('t1', 'u1', { manifest: fixtureManifest }))
        .rejects.toMatchObject({ response: { code: 'VERSION_ALREADY_REVIEWED' } });
      expect(prisma.draft.upsert).not.toHaveBeenCalled();
    });
  });

  describe('B2 — review submission', () => {
    it('stores a private candidate and queues the tenant for admin review', async () => {
      const { service, prisma } = createService();
      await service.publish('t1', 'u1', { manifest: fixtureManifest });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.release.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 't1', status: 'pending_review', id: { not: 'rel-1' } },
        data: { status: 'superseded' },
      });
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({
          appStatus: 'in_review',
          appReviewNote: null,
        }),
      });
    });

    it('supersedes an older pending candidate on a newer submission', async () => {
      const { service, prisma, redis } = createService();
      redis.get.mockResolvedValue(null);
      prisma.release.findFirst.mockResolvedValueOnce({
        version: '1.2.3',
        buildNumber: 1,
      });
      prisma.release.create.mockResolvedValueOnce({
        id: 'rel-2',
        version: '1.2.4',
        buildNumber: 2,
        checksum: 'new-checksum',
        status: 'pending_review',
        channel: 'production',
        publishedAt: new Date(),
      });

      const result = await service.submitForReview('t1', 'u1', {
        ...fixtureManifest,
        version: '1.2.4',
      });

      expect(result.status).toBe('in_review');
      expect(prisma.release.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 't1', status: 'pending_review', id: { not: 'rel-2' } },
        data: { status: 'superseded' },
      });
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({ appStatus: 'in_review' }),
      });
    });

    it('compiles saved drafts and stages the exact snapshot without persisting a competing draft', async () => {
      const { service, manifestCompiler, prisma } = createService();

      const result = await service.submitDraftsForReview('t1', 'u1');

      expect(manifestCompiler.compile).toHaveBeenCalledWith('t1', { persist: false });
      expect(prisma.release.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'pending_review' }),
      }));
      expect(result.status).toBe('in_review');
    });
  });

  describe('admin activation', () => {
    it('activates the exact pending candidate and records approval', async () => {
      const { service, prisma } = createService();
      const candidate = {
        id: 'rel-1',
        tenantId: 't1',
        version: '1.2.3',
        buildNumber: 1,
        status: 'pending_review',
        channel: 'production',
        manifest: fixtureManifest,
        checksum: 'candidate-checksum',
        publishedAt: new Date(),
      };
      prisma.draft.findUnique.mockResolvedValue({
        status: 'in_review',
        manifest: fixtureManifest,
      });
      prisma.release.findFirst
        .mockResolvedValueOnce(candidate)
        .mockResolvedValueOnce(candidate);
      prisma.release.update.mockResolvedValue({
        ...candidate,
        status: 'published',
        publishedAt: new Date(),
      });

      const result = await service.publishAsAdmin('t1');

      expect(prisma.release.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({ releaseId: 'rel-1', version: '1.2.3' });
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({ appStatus: 'approved' }),
      });
    });

    it('refuses activation when no staged candidate matches the submitted manifest', async () => {
      const { service, prisma } = createService();
      prisma.draft.findUnique.mockResolvedValue({
        status: 'in_review',
        manifest: fixtureManifest,
      });
      prisma.release.findFirst.mockResolvedValue(null);

      await expect(service.publishAsAdmin('t1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.release.create).not.toHaveBeenCalled();
    });
  });

  describe('submission status', () => {
    it('reports a rejected submission with the review note even when an older release is live', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue({
        activeReleaseId: 'live-release',
        appStatus: 'rejected',
        appReviewNote: 'Fix checkout links',
        appSubmittedAt: new Date(),
      });
      prisma.release.findFirst.mockResolvedValue({
        id: 'submitted-release',
        version: '3.0.0',
        status: 'rejected',
        releaseNotes: 'Fix checkout links',
        capabilityMeta: null,
        createdAt: new Date(),
      });

      const result = await service.getSubmissionStatus('t1', 'u1');

      expect(result).toMatchObject({
        status: 'rejected',
        activeReleaseId: 'live-release',
        reviewNote: 'Fix checkout links',
        release: {
          version: '3.0.0',
          releaseNotes: 'Fix checkout links',
        },
      });
    });

    it('reports in_review while the previous approved release stays live', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue({
        activeReleaseId: 'live-release',
        appStatus: 'in_review',
        appReviewNote: null,
        appSubmittedAt: new Date(),
      });
      prisma.release.findFirst.mockResolvedValue({
        id: 'submitted-release',
        version: '3.0.0',
        status: 'pending_review',
        releaseNotes: null,
        capabilityMeta: null,
        createdAt: new Date(),
      });

      const result = await service.getSubmissionStatus('t1', 'u1');

      expect(result).toMatchObject({ status: 'in_review', activeReleaseId: 'live-release' });
    });
  });

  describe('idempotency', () => {
    it('replays a cached response for the same Idempotency-Key', async () => {
      const { service, redis, prisma } = createService();
      const first = await service.publish('t1', 'u1', {
        manifest: fixtureManifest,
        idempotencyKey: 'k-1',
      });
      expect(redis.set).toHaveBeenCalledWith(
        'idem:publish:t1:k-1',
        expect.any(String),
        86400,
      );

      const stored = JSON.stringify(first);
      redis.get.mockImplementation((key: string) =>
        Promise.resolve(key === 'idem:publish:t1:k-1' ? stored : null),
      );
      const createsBefore = prisma.release.create.mock.calls.length;
      const second = await service.publish('t1', 'u1', {
        manifest: fixtureManifest,
        idempotencyKey: 'k-1',
      });
      // Idempotent replay JSON-roundtrips dates as strings — compare stable fields
      expect(second).toMatchObject({
        releaseId: first.releaseId,
        version: first.version,
        checksum: first.checksum,
        tenantId: first.tenantId,
        channel: first.channel,
      });
      expect(new Date(second.publishedAt).getTime()).toBe(
        new Date(first.publishedAt).getTime(),
      );
      expect(prisma.release.create.mock.calls.length).toBe(createsBefore);
    });
  });

  describe('B5 — rollback authorization', () => {
    it('requires owner/manager membership', async () => {
      const prisma: any = {
        tenantUser: {
          findUnique: jest.fn().mockResolvedValue({ role: 'viewer', status: 'active' }),
        },
        release: { findUnique: jest.fn() },
      };
      const svc = new PublishingService(
        prisma,
        { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any,
        { validateDraft: jest.fn() } as any,
        { compile: jest.fn() } as any,
        { publish: jest.fn() } as any,
        { invalidate: jest.fn() } as any,
        { evaluate: jest.fn(), assertCompatible: jest.fn() } as any,
      );
      await expect(svc.rollback('t1', '1.0.1', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('submits an approved rollback target as a new review candidate', async () => {
      const { service, prisma } = createService();
      prisma.release.findFirst.mockResolvedValue({
        version: '1.0.0',
        buildNumber: 1,
      });
      prisma.release.findUnique.mockResolvedValueOnce({
        id: 'previous-release',
        version: '1.0.0',
        status: 'superseded',
        manifest: fixtureManifest,
        capabilityMeta: {},
        assetManifest: {},
      }).mockResolvedValueOnce(null);

      const result = await service.rollback('t1', '1.0.0', 'u1');

      expect(result).toMatchObject({ status: 'pending_review', rollbackFrom: '1.0.0' });
      expect(prisma.release.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'pending_review' }),
      }));
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: expect.objectContaining({ appStatus: 'in_review' }),
      });
    });
  });

  describe('validation gate', () => {
    it('surfaces draft validation errors when no manifest is supplied', async () => {
      const { service, validationEngine, manifestCompiler } = createService();
      validationEngine.validateDraft.mockResolvedValue({
        passed: false,
        errors: [{ field: 'pages', message: 'At least one draft page is required' }],
        warnings: [],
      });
      await expect(service.publish('t1', 'u1', {})).rejects.toThrow(BadRequestException);
      expect(manifestCompiler.compile).not.toHaveBeenCalled();
    });
  });

  describe('B7 — runtime compatibility', () => {
    it('refuses to activate a manifest the shell cannot render', async () => {
      const { service, prisma } = createService();
      const manifest = JSON.parse(JSON.stringify(fixtureManifest));
      manifest.screens.home.layout.children.push({ type: 'holo_deck', props: {} });

      await expect(service.publish('t1', 'u1', { manifest })).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({ code: 'INCOMPATIBLE_RUNTIME' }),
      });
      expect(prisma.release.create).not.toHaveBeenCalled();
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('returns the contract on a successful publish', async () => {
      const { service } = createService();
      const result = await service.publish('t1', 'u1', { manifest: fixtureManifest });
      expect(result.compatibility).toEqual({
        contract: expect.objectContaining({ id: expect.any(String), version: expect.any(String) }),
        warnings: [],
      });
    });

    it('preflights a supplied manifest without publishing', async () => {
      const { service, prisma } = createService();
      const manifest = JSON.parse(JSON.stringify(fixtureManifest));
      manifest.screens.home.layout.children.push({ type: 'holo_deck', props: {} });

      const report = await service.preflight('t1', 'u1', { manifest });

      expect(report.source).toBe('manifest');
      expect(report.valid).toBe(true);
      expect(report.compatible).toBe(false);
      expect(report.errors.join(' ')).toContain('holo_deck');
      expect(prisma.release.create).not.toHaveBeenCalled();
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('preflights the compiled drafts when no manifest is supplied', async () => {
      const { service, manifestCompiler, prisma } = createService();

      const report = await service.preflight('t1', 'u1', {});

      expect(manifestCompiler.compile).toHaveBeenCalledWith('t1', { persist: false });
      expect(report.source).toBe('draft');
      expect(report.compatible).toBe(true);
      expect(prisma.release.create).not.toHaveBeenCalled();
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });
  });
});

describe('fixture schema sanity', () => {
  it('KB shared fixture shape validates', () => {
    // Minimal mirror of mobile/fixtures/published-app.json critical fields
    expect(() => ManifestValidator.assertValid(fixtureManifest)).not.toThrow();
  });
});
