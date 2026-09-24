import { MediaService } from './media.service';
import { BadRequestException } from '@nestjs/common';

const UUID = '11111111-2222-4333-8444-555555555555';
const OTHER_UUID = '99999999-8888-4777-8666-555555555555';

function makeService(opts: {
  folders?: Array<{ id: string; name: string; tenantId: string }>;
} = {}) {
  const folders = opts.folders ?? [];
  const prisma: any = {
    assetFolder: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const found = folders.find(
          (f) =>
            (!where.id || f.id === where.id) &&
            (!where.name || f.name === where.name) &&
            (!where.tenantId || f.tenantId === where.tenantId),
        );
        return Promise.resolve(found ?? null);
      }),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: OTHER_UUID, ...data }),
      ),
    },
    media: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'm1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    assetVersion: { create: jest.fn().mockResolvedValue({}) },
  };
  const redis: any = { del: jest.fn(), get: jest.fn(), set: jest.fn() };
  const imageOptimizer: any = {
    optimize: jest.fn().mockResolvedValue({
      optimized: { buffer: Buffer.from('o'), size: 1, mimeType: 'image/webp' },
      variants: [],
      metadata: { width: 10, height: 10, format: 'png' },
    }),
  };
  const storage: any = {
    upload: jest.fn().mockImplementation((key: string) =>
      Promise.resolve(key.startsWith('uploads/') ? `/${key}` : key),
    ),
    delete: jest.fn().mockResolvedValue(undefined),
    baseUrl: '',
  };
  const service = new MediaService(prisma, redis, imageOptimizer, storage);
  return { service, prisma, storage, imageOptimizer };
}

const imageFile = {
  originalname: 'logo.png',
  mimetype: 'image/png',
  size: 1024,
  buffer: Buffer.from('fake'),
};

describe('MediaService folderId (BUILDER TODO 3.1)', () => {
  it('uploads without folderId → folderId null (root), no FK violation', async () => {
    const { service, prisma } = makeService();
    await service.upload('t1', imageFile);
    expect(prisma.media.create.mock.calls[0][0].data.folderId).toBeNull();
  });

  it('legacy folderId=builder (non-UUID) auto-creates tenant folder', async () => {
    const { service, prisma } = makeService();
    const media = await service.upload('t1', imageFile, 'builder');
    expect(prisma.assetFolder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tenantId: 't1', name: 'builder' } }),
    );
    expect(media.folderId).toBe(OTHER_UUID);
  });

  it('reuses existing folder by name on second upload', async () => {
    const { service, prisma } = makeService({
      folders: [{ id: UUID, name: 'builder', tenantId: 't1' }],
    });
    await service.upload('t1', imageFile, 'builder');
    expect(prisma.assetFolder.create).not.toHaveBeenCalled();
    expect(prisma.media.create.mock.calls[0][0].data.folderId).toBe(UUID);
  });

  it('valid UUID that does not exist → 400 INVALID_FOLDER', async () => {
    const { service } = makeService({ folders: [] });
    await expect(service.upload('t1', imageFile, OTHER_UUID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_FOLDER' }),
      status: 400,
    });
  });

  it('valid UUID belonging to tenant is accepted', async () => {
    const { service, prisma } = makeService({
      folders: [{ id: UUID, name: 'assets', tenantId: 't1' }],
    });
    await service.upload('t1', imageFile, UUID);
    expect(prisma.media.create.mock.calls[0][0].data.folderId).toBe(UUID);
  });

  it('findAll without folderId does not force folderId=null filter', async () => {
    const { service, prisma } = makeService();
    await service.findAll('t1');
    expect(prisma.media.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
  });
});

describe('MediaService storage URLs (B6)', () => {
  it('uses StorageService returned URL for the stored media', async () => {
    const { service, storage, prisma } = makeService();
    storage.upload.mockImplementation((key: string) =>
      Promise.resolve(`https://cdn.example.com/${key}`),
    );
    // non-image path skips optimizer
    await service.upload('t1', {
      originalname: 'doc.pdf',
      mimetype: 'application/pdf',
      size: 10,
      buffer: Buffer.from('x'),
    });
    expect(String(prisma.media.create.mock.calls[0][0].data.url)).toContain(
      'https://cdn.example.com/uploads/',
    );
    expect(String(prisma.media.create.mock.calls[0][0].data.url)).toContain('.pdf');
  });

  it('does not delete the original when original key equals optimized .webp key', async () => {
    const { service, storage, imageOptimizer } = makeService();
    // .webp upload → same key as optimized
    imageOptimizer.optimize.mockResolvedValue({
      optimized: { buffer: Buffer.from('o'), size: 1, mimeType: 'image/webp' },
      variants: [],
      metadata: { width: 10, height: 10, format: 'webp' },
    });

    await service.upload('t1', {
      originalname: 'logo.webp',
      mimetype: 'image/webp',
      size: 100,
      buffer: Buffer.from('x'),
    });

    // upload original + optimized (same key) — delete of original must be skipped
    const deletedKeys = storage.delete.mock.calls.map((c: any) => c[0]);
    const uploads = storage.upload.mock.calls.map((c: any) => c[0]);
    const originalKey = uploads[0];
    expect(originalKey.endsWith('.webp')).toBe(true);
    expect(deletedKeys).not.toContain(originalKey);
  });
});

describe('rejected uploads', () => {
  it('rejects disallowed mime types', async () => {
    const { service } = makeService();
    await expect(
      service.upload('t1', {
        originalname: 'x.exe',
        mimetype: 'application/x-msdownload',
        size: 10,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
