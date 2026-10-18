import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UnauthorizedException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';

const activeUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  firstName: 'Ada',
  lastName: 'Admin',
  status: 'active',
  passwordHash: '',
};

function createService({
  prisma = {},
  redis = {},
  emailAdapter = {},
}: {
  prisma?: Record<string, any>;
  redis?: Record<string, any>;
  emailAdapter?: Record<string, any>;
} = {}) {
  return new AuthService(
    prisma as any,
    { sign: () => 'access-token' } as any,
    { get: () => '15m' } as any,
    {} as any,
    redis as any,
    emailAdapter as any,
    {} as any,
    {} as any,
  );
}

describe('AuthService admin login challenge', () => {
  it('does not issue session tokens before platform admin OTP verification', async () => {
    const passwordHash = await bcrypt.hash('Pass1234!', 1);
    const redis = { set: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ ...activeUser, passwordHash }) },
      userRole: { findMany: jest.fn().mockResolvedValue([{ role: { name: 'platform_operator' } }]) },
      refreshToken: { create: jest.fn() },
    };

    const result = await createService({ prisma, redis }).login({
      email: activeUser.email,
      password: 'Pass1234!',
    } as any);

    expect(result).toMatchObject({
      requiresOtp: true,
      user: { id: activeUser.id, role: 'platform_operator' },
    });
    expect(result.challengeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(redis.set).toHaveBeenCalledWith(
      `admin-login:${result.challengeId}`,
      JSON.stringify({ userId: activeUser.id, email: activeUser.email }),
      300,
    );
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('keeps the Operations role distinct from Platform Operator in the session', async () => {
    const passwordHash = await bcrypt.hash('Pass1234!', 1);
    const redis = { set: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ ...activeUser, passwordHash }) },
      userRole: { findMany: jest.fn().mockResolvedValue([{ role: { name: 'operations' } }]) },
      refreshToken: { create: jest.fn() },
    };

    const result = await createService({ prisma, redis }).login({
      email: activeUser.email,
      password: 'Pass1234!',
    } as any);

    expect(result).toMatchObject({
      requiresOtp: true,
      user: { id: activeUser.id, role: 'operations' },
    });
  });

  it('keeps password-only tokens for non-platform users', async () => {
    const passwordHash = await bcrypt.hash('Pass1234!', 1);
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ ...activeUser, passwordHash }) },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
      tenantUser: { findMany: jest.fn().mockResolvedValue([]) },
      refreshToken: { create: jest.fn().mockResolvedValue({}) },
    };

    const result = await createService({ prisma }).login({
      email: activeUser.email,
      password: 'Pass1234!',
    } as any);

    if ('requiresOtp' in result) throw new Error('Non-platform login unexpectedly requested an OTP');
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('issues tokens only after a valid, matching challenge and OTP', async () => {
    const challengeId = '7ab6b44d-fb67-4ed2-a4f8-61f5a85a5ec6';
    const redis = {
      get: jest.fn()
        .mockResolvedValueOnce(JSON.stringify({ userId: activeUser.id, email: activeUser.email }))
        .mockResolvedValueOnce('123456'),
      del: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(0),
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(activeUser) },
      userRole: { findMany: jest.fn().mockResolvedValue([{ role: { name: 'platform_operator' } }]) },
      tenantUser: { findMany: jest.fn().mockResolvedValue([]) },
      refreshToken: { create: jest.fn().mockResolvedValue({}) },
    };

    const result = await createService({ prisma, redis }).verifyAdminLoginOtp({
      email: activeUser.email,
      otp: '123456',
      challengeId,
    });

    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: expect.any(String),
      user: { id: activeUser.id, role: 'platform_operator' },
    });
    expect(redis.del).toHaveBeenCalledWith(`otp:${activeUser.email}`);
    expect(redis.del).toHaveBeenCalledWith(`admin-login:${challengeId}`);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong OTP without issuing tokens', async () => {
    const redis = {
      get: jest.fn()
        .mockResolvedValueOnce(JSON.stringify({ userId: activeUser.id, email: activeUser.email }))
        .mockResolvedValueOnce('123456'),
      increment: jest.fn().mockResolvedValue(1),
    };
    const prisma = { refreshToken: { create: jest.fn() } };

    await expect(createService({ prisma, redis }).verifyAdminLoginOtp({
      email: activeUser.email,
      otp: '000000',
      challengeId: '7ab6b44d-fb67-4ed2-a4f8-61f5a85a5ec6',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('invalidates the challenge after five wrong OTP attempts', async () => {
    const challengeId = '7ab6b44d-fb67-4ed2-a4f8-61f5a85a5ec6';
    const redis = {
      get: jest.fn()
        .mockResolvedValueOnce(JSON.stringify({ userId: activeUser.id, email: activeUser.email }))
        .mockResolvedValueOnce('123456'),
      increment: jest.fn().mockResolvedValue(5),
      del: jest.fn().mockResolvedValue(undefined),
    };

    await expect(createService({ redis }).verifyAdminLoginOtp({
      email: activeUser.email,
      otp: '000000',
      challengeId,
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.del).toHaveBeenCalledWith(`otp:${activeUser.email}`);
    expect(redis.del).toHaveBeenCalledWith(`admin-login:${challengeId}`);
  });

  it('rejects sending a code for an expired challenge', async () => {
    const service = createService({ redis: { get: jest.fn().mockResolvedValue(null) } });
    await expect(service.sendOtp(activeUser.email, '7ab6b44d-fb67-4ed2-a4f8-61f5a85a5ec6'))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not claim OTP delivery succeeded when the email provider fails', async () => {
    const redis = { set: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined) };
    const emailAdapter = { send: jest.fn().mockResolvedValue({ success: false }) };

    await expect(createService({ redis, emailAdapter }).sendOtp(activeUser.email))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(redis.del).toHaveBeenCalledWith(`otp:${activeUser.email}`);
  });

  it('rejects a revoked refresh token', async () => {
    const service = createService({
      prisma: {
        refreshToken: {
          findUnique: jest.fn().mockResolvedValue({
            revoked: true,
            expiresAt: new Date(Date.now() + 60_000),
            user: { id: activeUser.id, email: activeUser.email, status: 'active' },
          }),
        },
      },
    });

    await expect(service.refresh({ refreshToken: 'revoked-token' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes all active refresh tokens on logout', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const service = createService({ prisma: { refreshToken: { updateMany } } });

    await expect(service.logout(activeUser.id)).resolves.toEqual({ message: 'Logged out successfully' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: activeUser.id, revoked: false },
      data: { revoked: true },
    });
  });
});
