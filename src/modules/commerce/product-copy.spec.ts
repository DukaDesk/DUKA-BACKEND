import { assertProductCopy, CommerceService } from './commerce.service';

describe('assertProductCopy', () => {
  it('accepts copy within limits', () => {
    expect(() => assertProductCopy('a'.repeat(800), 'b'.repeat(100))).not.toThrow();
    expect(() => assertProductCopy(undefined, undefined)).not.toThrow();
  });

  it('rejects over-long descriptions', () => {
    expect(() => assertProductCopy('a'.repeat(801))).toThrow(/800/);
    expect(() => assertProductCopy('ok', 'b'.repeat(101))).toThrow(/100/);
  });
});

describe('createProduct slug handling', () => {
  const service = (create: jest.Mock) => new CommerceService(
    { product: { create } } as any,
    {} as any,
  );

  it('slugifies the name when no slug is sent', async () => {
    const create = jest.fn(async ({ data }: any) => ({ id: 'p1', ...data }));
    await service(create).createProduct('t1', { name: 'Jollof Rice!', price: 100 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.slug).toBe('jollof-rice');
  });

  it('retries with a suffix on slug collisions', async () => {
    const taken = new Error('Unique constraint');
    (taken as any).code = 'P2002';
    const create = jest.fn()
      .mockRejectedValueOnce(taken)
      .mockImplementation(async ({ data }: any) => ({ id: 'p2', ...data }));
    const result = await service(create).createProduct('t1', { name: 'Beans', price: 100 });
    expect(result.slug).toBe('beans-2');
  });

  it('retries without new columns when the migration has not landed', async () => {
    const missing = new Error('Column does not exist');
    (missing as any).code = 'P2022';
    const create = jest.fn()
      .mockRejectedValueOnce(missing)
      .mockImplementation(async ({ data }: any) => ({ id: 'p3', ...data }));
    const result = await service(create).createProduct('t1', { name: 'Yam', price: 100, tags: ['staple'], badge: 'HOT' });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.slug).toBe('yam');
    expect(create.mock.calls[1][0].data.tags).toBeUndefined();
    expect(create.mock.calls[1][0].data.badge).toBeUndefined();
  });
});
