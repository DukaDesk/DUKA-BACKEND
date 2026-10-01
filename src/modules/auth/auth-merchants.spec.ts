import { AuthService } from './auth.service';

const makeService = (prisma: any, merchantsService: any = {}) =>
  new AuthService(prisma as any, { sign: () => 'access' } as any, { get: () => undefined } as any, {} as any, {} as any, {} as any, merchantsService as any, {} as any);

describe('authenticated merchant references', () => {
  it('refresh returns merchant IDs and limits the query to the authenticated user active memberships', async () => {
    const prisma = {
      tenantUser: { findMany: jest.fn().mockResolvedValue([{ role: 'owner', tenant: { id: 'merchant-1', name: 'Shop', slug: 'shop' } }]) },
      refreshToken: { findUnique: jest.fn().mockResolvedValue({ id: 'refresh-1', revoked: false, expiresAt: new Date(Date.now() + 60000), user: { id: 'user-1', email: 'a@example.com' } }), update: jest.fn(), create: jest.fn() },
    };
    const service = makeService(prisma);
    const result = await service.refresh({ refreshToken: 'refresh' });
    expect(result.merchants).toEqual([{ id: 'merchant-1', name: 'Shop', slug: 'shop', role: 'owner' }]);
    expect(prisma.tenantUser.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', status: 'active' } }));
    expect(result.accessToken).toBe('access');
  });

  it('self-serve register (no role) provisions an active user plus owned merchant and tokens', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'user-9', email: 'ada@test.com', firstName: 'Ada', lastName: 'Okafor', status: 'active' }) },
      tenantUser: { findMany: jest.fn().mockResolvedValue([{ role: 'owner', tenant: { id: 'merchant-9', name: "Ada's Kitchen", slug: 'ada-s-kitchen' } }]) },
      refreshToken: { create: jest.fn().mockResolvedValue({ token: 'refresh' }) },
    };
    const merchantsService = {
      create: jest.fn().mockResolvedValue({ id: 'merchant-9', name: "Ada's Kitchen", slug: 'ada-s-kitchen' }),
    };
    const passwordService = { validatePasswordStrength: jest.fn(), hash: jest.fn().mockResolvedValue('hash'), recordHistory: jest.fn() };
    const service = new AuthService(prisma as any, { sign: () => 'access' } as any, { get: () => undefined } as any, passwordService as any, {} as any, {} as any, merchantsService as any, {} as any);
    const result = await (service.register as any)({ email: 'ada@test.com', firstName: 'Ada', lastName: 'Okafor', password: 'Pass1234!', businessName: "Ada's Kitchen" } as any);
    expect(merchantsService.create).toHaveBeenCalledWith('user-9', expect.objectContaining({ name: "Ada's Kitchen" }));
    expect(result.merchants).toEqual([{ id: 'merchant-9', name: "Ada's Kitchen", slug: 'ada-s-kitchen', role: 'owner' }]);
    expect(result.accessToken).toBe('access');
    expect((result as any).pending).toBeUndefined();
  });

  it('self-serve register retries the merchant slug on conflict', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'user-9', email: 'a@test.com', firstName: 'A', lastName: 'B', status: 'active' }) },
      tenantUser: { findMany: jest.fn().mockResolvedValue([{ role: 'owner', tenant: { id: 'm2', name: 'Shop', slug: 'shop-123' } }]) },
      refreshToken: { create: jest.fn().mockResolvedValue({ token: 'refresh' }) },
    };
    const conflict = Object.assign(new Error('conflict'), { response: { message: 'A merchant with this slug already exists' } });
    const merchantsService = {
      create: jest.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce({ id: 'm2', name: 'Shop', slug: 'shop-123' }),
    };
    const passwordService = { validatePasswordStrength: jest.fn(), hash: jest.fn().mockResolvedValue('hash'), recordHistory: jest.fn() };
    const service = new AuthService(prisma as any, { sign: () => 'access' } as any, { get: () => undefined } as any, passwordService as any, {} as any, {} as any, merchantsService as any, {} as any);
    const result = await (service.register as any)({ email: 'a@test.com', firstName: 'A', lastName: 'B', password: 'Pass1234!' } as any);
    expect(merchantsService.create).toHaveBeenCalledTimes(2);
    expect(result.merchants).toEqual([{ id: 'm2', name: 'Shop', slug: 'shop-123', role: 'owner' }]);
  });
});


