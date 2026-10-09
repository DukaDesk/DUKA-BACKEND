import { MobileBffService } from './mobile-bff.service';

describe('MobileBffService manifest approval gate', () => {
  it('does not return a cached manifest for a tenant awaiting approval', async () => {
    const redis: any = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ manifestVersion: '1.0.0' })),
      set: jest.fn(),
      del: jest.fn(),
    };
    const releases: any = {
      resolveTenant: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        slug: 'shop',
        status: 'draft',
        activeReleaseId: null,
      }),
      getActiveRelease: jest.fn(),
    };
    const service = new MobileBffService({} as any, redis, releases);

    await expect(service.getTenantManifest('shop')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APP_NOT_APPROVED' }),
    });
    expect(redis.get).not.toHaveBeenCalled();
    expect(releases.getActiveRelease).not.toHaveBeenCalled();
  });

  it('returns cache only after confirming the tenant is approved and active', async () => {
    const cached = { manifestVersion: '1.0.0', version: '1.2.3' };
    const redis: any = { get: jest.fn().mockResolvedValue(JSON.stringify(cached)), set: jest.fn(), del: jest.fn() };
    const releases: any = {
      resolveTenant: jest.fn().mockResolvedValue({ id: 'tenant-1', slug: 'shop', status: 'published', activeReleaseId: 'release-1' }),
      getActiveRelease: jest.fn(),
    };
    const service = new MobileBffService({} as any, redis, releases);

    await expect(service.getTenantManifest('shop')).resolves.toEqual(cached);
    expect(redis.get).toHaveBeenCalledWith('manifest:shop');
    expect(releases.getActiveRelease).not.toHaveBeenCalled();
  });
});
