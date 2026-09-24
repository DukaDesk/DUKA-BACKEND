import { PublishingService } from './publishing.service';
import { ManifestValidator } from './manifest-validator.service';
import { BadRequestException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';

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
    draft: { findUnique: jest.fn(), upsert: jest.fn() },
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
    compile: jest.fn(),
  };

  const eventBus: any = { publish: jest.fn() };
  const releases: any = { invalidate: jest.fn().mockResolvedValue(undefined) };

  const service = new PublishingService(
    prisma,
    redis,
    validationEngine,
    manifestCompiler,
    eventBus,
    releases,
  );

  return { service, prisma, redis, validationEngine, manifestCompiler, eventBus, releases };
}

describe('PublishingService', () => {
  describe('B1 — client manifest path', () => {
    it('persists the submitted PublishedApp without invoking the compiler', async () => {
      const { service, manifestCompiler, prisma } = createService();

      const result = await service.publish('t1', 'u1', { manifest: fixtureManifest });

      expect(manifestCompiler.compile).not.toHaveBeenCalled();
      expect(prisma.release.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.release.create.mock.calls[0][0];
      expect(createArgs.data.status).toBe('published');
      // Object screens preserved exactly
      expect(createArgs.data.manifest.screens).toEqual(fixtureManifest.screens);
      expect(Array.isArray(createArgs.data.manifest.screens)).toBe(false);
      expect(result).toMatchObject({
        releaseId: 'rel-1',
        tenantId: 't1',
        channel: 'production',
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
  });

  describe('B2 — activation', () => {
    it('runs activation inside a transaction and sets activeReleaseId', async () => {
      const { service, prisma } = createService();
      await service.publish('t1', 'u1', { manifest: fixtureManifest });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.release.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 't1', status: 'published', channel: 'production' },
          data: { status: 'superseded' },
        }),
      );
      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: expect.objectContaining({ activeReleaseId: expect.anything() }),
        }),
      );
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
      );
      await expect(svc.rollback('t1', '1.0.1', 'u1')).rejects.toThrow(ForbiddenException);
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
});

describe('fixture schema sanity', () => {
  it('KB shared fixture shape validates', () => {
    // Minimal mirror of mobile/fixtures/published-app.json critical fields
    expect(() => ManifestValidator.assertValid(fixtureManifest)).not.toThrow();
  });
});
