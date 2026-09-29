import { AuthService } from './auth.service';
describe('authenticated merchant references', () => {
  it('refresh returns merchant IDs and limits the query to the authenticated user active memberships', async () => {
    const prisma = {
      tenantUser: { findMany: jest.fn().mockResolvedValue([{ role: 'owner', tenant: { id: 'merchant-1', name: 'Shop', slug: 'shop' } }]) },
      refreshToken: { findUnique: jest.fn().mockResolvedValue({ id: 'refresh-1', revoked: false, expiresAt: new Date(Date.now() + 60000), user: { id: 'user-1', email: 'a@example.com' } }), update: jest.fn(), create: jest.fn() },
    };
    const service = new AuthService(prisma as any, { sign: () => 'access' } as any, { get: () => undefined } as any, {} as any, {} as any, {} as any);
    const result = await service.refresh({ refreshToken: 'refresh' });
    expect(result.merchants).toEqual([{ id: 'merchant-1', name: 'Shop', slug: 'shop', role: 'owner' }]);
    expect(prisma.tenantUser.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', status: 'active' } }));
    expect(result.accessToken).toBe('access');
  });
});
