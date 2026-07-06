import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class InfrastructureService {
  private readonly logger = new Logger(InfrastructureService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Deployments ─────────────────────────────────────────────

  async createDeployment(data: {
    tenantId: string; version: string; branch?: string;
    commitHash?: string; triggeredBy?: string; metadata?: Record<string, any>;
  }) {
    return this.prisma.deployment.create({ data: data as any });
  }

  async getDeployments(tenantId: string, page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.deployment.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deployment.count({ where: { tenantId } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getDeployment(id: string) {
    const dep = await this.prisma.deployment.findUnique({ where: { id } });
    if (!dep) throw new NotFoundException('Deployment not found');
    return dep;
  }

  async updateDeploymentStatus(id: string, data: {
    status: string; buildLog?: string; artifactUrl?: string; completedAt?: string;
  }) {
    return this.prisma.deployment.update({
      where: { id },
      data: {
        ...data,
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      } as any,
    });
  }

  // ─── Environments ────────────────────────────────────────────

  async createEnvironment(data: {
    tenantId?: string; name: string; slug: string;
    variables?: Record<string, string>; isActive?: boolean;
  }) {
    return this.prisma.environment.create({ data: data as any });
  }

  async getEnvironments(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.prisma.environment.findMany({ where, orderBy: { name: 'asc' } });
  }

  async getEnvironment(id: string) {
    const env = await this.prisma.environment.findUnique({ where: { id } });
    if (!env) throw new NotFoundException('Environment not found');
    return env;
  }

  async updateEnvironment(id: string, data: Partial<{
    name: string; variables: Record<string, string>; isActive: boolean;
  }>) {
    return this.prisma.environment.update({ where: { id }, data: data as any });
  }

  async deleteEnvironment(id: string) {
    return this.prisma.environment.delete({ where: { id } });
  }

  // ─── Health Checks ───────────────────────────────────────────

  async recordHealthCheck(data: {
    tenantId?: string; service: string; status: string;
    latencyMs?: number; message?: string;
  }) {
    return this.prisma.healthCheck.create({ data: data as any });
  }

  async getHealthHistory(tenantId?: string, service?: string, limit = 100) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (service) where.service = service;

    return this.prisma.healthCheck.findMany({
      where,
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });
  }

  async getServiceStatus(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;

    const recent = await this.prisma.healthCheck.groupBy({
      by: ['service'],
      where: { ...where },
      _max: { checkedAt: true },
    });

    const statuses: Array<{
      service: string; status: string; lastChecked?: Date; latencyMs?: number | null;
    }> = [];
    for (const group of recent) {
      const lastCheck = await this.prisma.healthCheck.findFirst({
        where: { service: group.service, ...where },
        orderBy: { checkedAt: 'desc' },
      });
      statuses.push({
        service: group.service,
        status: lastCheck?.status || 'unknown',
        lastChecked: lastCheck?.checkedAt,
        latencyMs: lastCheck?.latencyMs,
      });
    }

    return statuses;
  }

  // ─── Backups ─────────────────────────────────────────────────

  async createBackup(data: {
    tenantId: string; type?: string; includes?: string[]; excludes?: string[];
  }) {
    return this.prisma.backup.create({ data: data as any });
  }

  async getBackups(tenantId: string, page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.backup.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.backup.count({ where: { tenantId } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateBackupStatus(id: string, data: {
    status: string; sizeBytes?: number; fileUrl?: string; completedAt?: string;
  }) {
    return this.prisma.backup.update({
      where: { id },
      data: {
        ...data,
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      } as any,
    });
  }

  // ─── Cache ───────────────────────────────────────────────────

  async clearCache(tenantId?: string) {
    this.logger.log(`Cache clear requested for tenant: ${tenantId || 'all'}`);
    return { cleared: true, tenantId: tenantId || 'all', timestamp: new Date() };
  }

  async getCacheStats() {
    return {
      status: 'available',
      provider: 'ioredis',
      memoryUsage: 'N/A (mock)',
      hitRate: 'N/A',
      uptime: 'N/A',
    };
  }

  // ─── Infrastructure Overview ─────────────────────────────────

  async getInfraOverview() {
    const [deployments, backups, healthChecks] = await Promise.all([
      this.prisma.deployment.count(),
      this.prisma.backup.count(),
      this.prisma.healthCheck.count(),
    ]);

    const failedDeployments = await this.prisma.deployment.count({ where: { status: 'failed' } });
    const recentHealthIssues = await this.prisma.healthCheck.count({
      where: { status: 'down', checkedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    return {
      totalDeployments: deployments,
      failedDeployments,
      totalBackups: backups,
      totalHealthChecks: healthChecks,
      recentHealthIssues24h: recentHealthIssues,
    };
  }
}
