import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, data: {
    name: string; type?: string; metric: string;
    filters?: Record<string, any>; groupBy?: string;
    period?: string; schedule?: string;
    recipients?: string[]; format?: string;
  }) {
    return this.prisma.savedReport.create({ data: { tenantId, ...data } as any });
  }

  async findAll(tenantId: string) {
    return this.prisma.savedReport.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const report = await this.prisma.savedReport.findFirst({
      where: { id, tenantId },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async update(tenantId: string, id: string, data: Partial<{
    name: string; type: string; metric: string;
    filters: Record<string, any>; groupBy: string;
    period: string; schedule: string; recipients: string[]; format: string;
  }>) {
    await this.findOne(tenantId, id);
    return this.prisma.savedReport.update({ where: { id }, data: data as any });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.savedReport.delete({ where: { id } });
  }
}
