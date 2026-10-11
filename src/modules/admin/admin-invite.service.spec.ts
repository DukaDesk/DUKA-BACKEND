import { ForbiddenException } from '@nestjs/common';
import { AdminInviteService } from './admin-invite.service';

function makeService(actorRoles: string[]) {
  const prisma: any = {
    userRole: {
      findMany: jest.fn().mockResolvedValue(actorRoles.map((name) => ({ role: { name } }))),
    },
    adminInvite: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'invite-1', ...data })),
    },
  };
  return { service: new AdminInviteService(prisma), prisma };
}

describe('AdminInviteService privilege checks', () => {
  it('blocks platform officers from inviting a super admin', async () => {
    const { service, prisma } = makeService(['operations']);
    await expect(service.createInvite('officer-1', { email: 'root@example.test', role: 'super_admin' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.adminInvite.create).not.toHaveBeenCalled();
  });

  it('allows a super admin to invite a super admin', async () => {
    const { service, prisma } = makeService(['super_admin']);
    const result = await service.createInvite('root-1', { email: 'root@example.test', role: 'super_admin' });
    expect(result).toMatchObject({ id: 'invite-1', email: 'root@example.test', role: 'super_admin' });
    expect(prisma.adminInvite.create).toHaveBeenCalled();
  });

  it('blocks users without platform roles from issuing any invite', async () => {
    const { service, prisma } = makeService([]);
    await expect(service.createInvite('merchant-1', { email: 'ops@example.test', role: 'platform_operator' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.adminInvite.create).not.toHaveBeenCalled();
  });
});
