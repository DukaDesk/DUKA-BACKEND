import { InfrastructureService } from './infrastructure.service';
import { PrismaService } from '../../common/prisma.service';

describe('InfrastructureService environments', () => {
  it('returns a bounded, paginated environment list', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'environment-1', name: 'Production' }]);
    const count = jest.fn().mockResolvedValue(125);
    const service = new InfrastructureService({
      environment: { findMany, count },
    } as unknown as PrismaService);

    const result = await service.getEnvironments(undefined, 2, 500);

    expect(findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { name: 'asc' },
      skip: 100,
      take: 100,
    });
    expect(count).toHaveBeenCalledWith({ where: {} });
    expect(result).toEqual({
      data: [{ id: 'environment-1', name: 'Production' }],
      total: 125,
      page: 2,
      limit: 100,
      totalPages: 2,
    });
  });
});
