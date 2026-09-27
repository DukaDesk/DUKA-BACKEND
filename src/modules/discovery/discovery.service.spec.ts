import { DiscoveryService } from './discovery.service';

function makeService(rows: {
  tenants?: any[];
  releases?: any[];
} = {}) {
  const prisma: any = {
    tenant: { findMany: jest.fn().mockResolvedValue(rows.tenants ?? []) },
    release: { findMany: jest.fn().mockResolvedValue(rows.releases ?? []) },
  };
  return { service: new DiscoveryService(prisma), prisma };
}

describe('DiscoveryService (B7)', () => {
  it('only lists tenants that have been activated', async () => {
    const { service, prisma } = makeService({
      tenants: [
        {
          id: 't-active',
          name: 'Active',
          slug: 'active',
          logo: null,
          publishedAt: new Date('2026-09-27'),
          activeReleaseId: 'rel-1',
        },
      ],
    });

    const featured = await service.getFeatured();

    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'published',
          activeReleaseId: { not: null },
        }),
      }),
    );
    expect(featured).toHaveLength(1);
    expect(featured[0]).toMatchObject({
      id: 't-active',
      name: 'Active',
      slug: 'active',
      publishedAt: expect.any(Date),
    });
    expect(featured[0]).not.toHaveProperty('activeReleaseId');
  });

  it('projects the active release identity', async () => {
    const { service } = makeService({
      tenants: [
        {
          id: 't-active',
          name: 'Active',
          slug: 'active',
          logo: '/logo.png',
          publishedAt: new Date(),
          activeReleaseId: 'rel-1',
        },
      ],
      releases: [
        {
          id: 'rel-1',
          tenantId: 't-active',
          version: '1.0.4',
          checksum: 'abc123',
          channel: 'production',
          publishedAt: new Date(),
        },
      ],
    });

    const [entry] = await service.search('Active');
    expect(entry.release).toMatchObject({
      id: 'rel-1',
      version: '1.0.4',
      checksum: 'abc123',
      channel: 'production',
    });
  });

  it('returns release: null when the pointed release row is gone', async () => {
    const { service } = makeService({
      tenants: [
        {
          id: 't-dangling',
          name: 'Dangling',
          slug: 'dangling',
          logo: null,
          publishedAt: new Date(),
          activeReleaseId: 'rel-missing',
        },
      ],
      releases: [],
    });

    const featured = await service.getFeatured();
    expect(featured[0].release).toBeNull();
  });

  it('keeps categories static', async () => {
    const { service } = makeService();
    const categories = await service.getCategories();
    expect(categories.length).toBeGreaterThan(0);
    expect(categories[0]).toHaveProperty('id');
  });
});
