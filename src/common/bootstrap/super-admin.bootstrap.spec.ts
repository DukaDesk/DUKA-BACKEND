import { SuperAdminBootstrap } from './super-admin.bootstrap';

describe('SuperAdminBootstrap', () => {
  const previousEmail = process.env.SUPER_ADMIN_EMAIL;
  const previousPassword = process.env.SUPER_ADMIN_PASSWORD;

  afterEach(() => {
    if (previousEmail === undefined) delete process.env.SUPER_ADMIN_EMAIL;
    else process.env.SUPER_ADMIN_EMAIL = previousEmail;
    if (previousPassword === undefined) delete process.env.SUPER_ADMIN_PASSWORD;
    else process.env.SUPER_ADMIN_PASSWORD = previousPassword;
  });

  function makePrisma(existingUser: any = null) {
    return {
      role: { upsert: jest.fn().mockResolvedValue({ id: 'role-super', name: 'super_admin' }) },
      user: {
        findUnique: jest.fn().mockResolvedValue(existingUser),
        create: jest.fn().mockResolvedValue({ id: 'user-super', passwordHash: 'hashed' }),
        update: jest.fn().mockResolvedValue({ id: 'user-super', passwordHash: 'hashed' }),
      },
      userRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'membership' }),
      },
    };
  }

  it('does not create a default account when bootstrap credentials are absent', async () => {
    delete process.env.SUPER_ADMIN_EMAIL;
    delete process.env.SUPER_ADMIN_PASSWORD;
    const prisma = makePrisma();
    await new SuperAdminBootstrap(prisma as any).onModuleInit();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('creates and assigns the configured account', async () => {
    process.env.SUPER_ADMIN_EMAIL = 'Owner@Example.test';
    process.env.SUPER_ADMIN_PASSWORD = 'a-strong-generated-password-123';
    const prisma = makePrisma();
    await new SuperAdminBootstrap(prisma as any).onModuleInit();
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'owner@example.test', status: 'active', emailVerified: true }),
    }));
    expect(prisma.userRole.create).toHaveBeenCalled();
  });

  it('does not overwrite an existing account password', async () => {
    process.env.SUPER_ADMIN_EMAIL = 'owner@example.test';
    process.env.SUPER_ADMIN_PASSWORD = 'a-strong-generated-password-123';
    const prisma = makePrisma({ id: 'user-existing', passwordHash: 'existing-hash' });
    await new SuperAdminBootstrap(prisma as any).onModuleInit();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
