import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommsService } from './comms.service';

const prismaMock = {
  tenant: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  announcement: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
  },
  announcementReply: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  },
  announcementRead: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
};

const comms = new CommsService(prismaMock as any);

describe('CommsService (platform messaging)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('every audience carries media — merchant broadcasts included', async () => {
    prismaMock.announcement.create.mockResolvedValue({ id: 'a-1', kind: 'broadcast', audience: 'merchants' });
    const media = [{ url: 'https://cdn.example.test/a.jpg', type: 'image' } as any];
    await expect(
      comms.createAnnouncement({ kind: 'broadcast', audience: 'merchants', body: 'Merchants receive media too', media }),
    ).resolves.toMatchObject({ audience: 'merchants' });
    prismaMock.announcement.create.mockResolvedValue({ id: 'a-2', audience: 'mobile' });
    await expect(comms.createAnnouncement({ kind: 'broadcast', audience: 'mobile', body: 'New feature', media }))
      .resolves.toMatchObject({ audience: 'mobile' });
  });

  it('broadcast needs a valid audience; both covers both apps surfaces', async () => {
    await expect(comms.createAnnouncement({ kind: 'broadcast', body: 'Hi' } as any)).rejects.toThrow('broadcast requires audience');
    prismaMock.announcement.create.mockResolvedValue({ id: 'a-2' });
    await comms.createAnnouncement({ kind: 'broadcast', audience: 'both', body: 'Hi' });
    expect(prismaMock.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ audience: 'both', kind: 'broadcast' }) }),
    );
  });

  it('direct takes exactly one recipient and validates it exists', async () => {
    await expect(comms.createAnnouncement({ kind: 'direct', body: 'Yo' } as any)).rejects.toThrow('needs one recipient');
    await expect(
      comms.createAnnouncement({ kind: 'direct', body: 'Yo', tenantId: 't-1', recipientActorId: 'upd' } as any),
    ).rejects.toThrow('exactly one recipient');
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    await expect(comms.createAnnouncement({ kind: 'direct', body: 'Yo', tenantId: 't-1' } as any)).rejects.toThrow('does not exist');
    prismaMock.tenant.findUnique.mockResolvedValue({ id: 't-1' });
    await comms.createAnnouncement({ kind: 'direct', body: 'Yo', tenantId: 't-1' });
    expect(prismaMock.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'direct', tenantId: 't-1' }) }),
    );
  });

  it('direct merchant messages carry media like any other message', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({ id: 't-1' });
    prismaMock.announcement.create.mockResolvedValue({ id: 'a-1', kind: 'direct' });
    await expect(
      comms.createAnnouncement({
        kind: 'direct', body: 'Yo', tenantId: 't-1',
        media: [{ url: 'https://cdn.example.test/a.jpg', type: 'image' } as any],
      }),
    ).resolves.toMatchObject({ kind: 'direct' });
  });

  it('recipients picker lists tenants and excludes platform staff from the user list', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 't-1', name: 'Mama', slug: 'mama', logo: null, status: 'published' }]);
    prismaMock.user.findMany.mockResolvedValue([]);
    const result = await comms.listRecipients();
    expect(result.tenants).toEqual([expect.objectContaining({ id: 't-1' })]);
    const userWhere = (prismaMock.user.findMany.mock.calls[0][0] as any).where;
    expect(userWhere.roles.none.role.name.in).toContain('platform_operator');
  });

  it('merchant inbox matches broadcasts (merchants/both) + direct tenant messages', async () => {
    prismaMock.announcement.findMany.mockResolvedValue([]);
    await comms.merchantList('t-1');
    expect(prismaMock.announcement.findMany.mock.calls[0][0].where).toMatchObject({
      OR: [
        { kind: 'broadcast', audience: { in: ['merchants', 'both'] } },
        { kind: 'direct', tenantId: 't-1' },
      ],
    });
  });

  it('merchant reply pins tenant + author and requires text', async () => {
    prismaMock.announcement.findFirst.mockResolvedValue({ id: 'a-1' });
    await expect(comms.merchantReply('a-1', 't-1', '   ')).rejects.toThrow(BadRequestException);
    prismaMock.announcementReply.create.mockResolvedValue({ id: 'r-1', author: 'merchant', tenantId: 't-1', body: 'ok' });
    await expect(comms.merchantReply('a-1', 't-1', 'Calling back')).resolves.toMatchObject({ author: 'merchant', tenantId: 't-1' });
  });

  it('merchant thread is tenant-scoped and excludes foreign replies', async () => {
    prismaMock.announcement.findFirst.mockResolvedValue({ id: 'a-1', kind: 'direct' });
    await comms.merchantThread('a-1', 't-1');
    expect(prismaMock.announcementReply.findMany.mock.calls[0][0].where).toMatchObject({
      announcementId: 'a-1',
      OR: [{ author: 'platform' }, { tenantId: 't-1' }],
    });
  });

  it('marks read idempotently per tenant', async () => {
    prismaMock.announcementRead.findFirst.mockResolvedValue({ id: 'read-1', readAt: new Date() });
    await expect(comms.markMerchantRead('a-1', 't-1')).resolves.toMatchObject({ alreadyRead: true });
    prismaMock.announcementRead.findFirst.mockResolvedValue(null);
    prismaMock.announcementRead.create.mockResolvedValue({ id: 'read-2', readAt: new Date() });
    await expect(comms.markMerchantRead('a-1', 't-1')).resolves.toMatchObject({ alreadyRead: false });
    expect(prismaMock.announcementRead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { announcementId: 'a-1', tenantId: 't-1' } }),
    );
  });

  it('hides recipient identity from merchant inbox payloads', async () => {
    const row: any = { id: 'a-1', kind: 'direct', recipientActorId: 'dev-9', recipientUserId: 'u-9', reads: [], unread: false, readAt: null };
    prismaMock.announcement.findMany.mockResolvedValue([row]);
    const { data } = await comms.merchantList('t-1');
    expect(data[0]).toMatchObject({ id: 'a-1', unread: true, readAt: null });
    expect(data[0].recipientActorId).toBeUndefined();
    expect(data[0].recipientUserId).toBeUndefined();
    expect(data[0].reads).toBeUndefined();
  });

  it('platform replies are author=platform and thread lookup 404s safely', async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(null);
    await expect(comms.getThread('nope')).rejects.toThrow(NotFoundException);
    prismaMock.announcement.findUnique.mockResolvedValue({ id: 'a-1' });
    prismaMock.announcementReply.create.mockResolvedValue({ id: 'r-2', author: 'platform' });
    await expect(comms.addPlatformReply('a-1', 'Here to help')).resolves.toMatchObject({ author: 'platform' });
  });

  it('platform tenant upsert keys media storage on the platform slug', async () => {
    prismaMock.tenant.upsert.mockResolvedValue({ id: 'platform-tenant' });
    await expect(comms.getPlatformTenantId()).resolves.toBe('platform-tenant');
    expect(prismaMock.tenant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'duka-desk-platform' } }),
    );
  });
});
