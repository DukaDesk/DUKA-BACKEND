import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private prisma: PrismaService) {}

  async index(data: {
    tenantId: string;
    entityType: string;
    entityId: string;
    title?: string;
    content?: string;
    tags?: string[];
    metadata?: Record<string, any>;
    locale?: string;
  }) {
    return this.prisma.searchIndex.upsert({
      where: { tenantId_entityType_entityId: { tenantId: data.tenantId, entityType: data.entityType, entityId: data.entityId } },
      create: { ...data, tags: data.tags || [] } as any,
      update: { ...data, tags: data.tags || [] } as any,
    });
  }

  async remove(tenantId: string, entityType: string, entityId: string) {
    try {
      await this.prisma.searchIndex.delete({
        where: { tenantId_entityType_entityId: { tenantId, entityType, entityId } },
      });
    } catch {}
  }

  async bulkIndex(entries: Array<{
    tenantId: string; entityType: string; entityId: string;
    title?: string; content?: string; tags?: string[]; metadata?: Record<string, any>;
  }>) {
    const results: any[] = [];
    for (const entry of entries) {
      results.push(await this.index(entry));
    }
    return { indexed: results.length };
  }

  async search(params: {
    tenantId: string;
    query: string;
    entityTypes?: string[];
    tags?: string[];
    page?: number;
    limit?: number;
    locale?: string;
  }) {
    const startTime = Date.now();
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);

    const where: any = {
      tenantId: params.tenantId,
      published: true,
    };

    if (params.query) {
      const searchTerm = params.query.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { content: { contains: searchTerm, mode: 'insensitive' } },
        { tags: { has: searchTerm } },
      ];
    }

    if (params.entityTypes?.length) {
      where.entityType = { in: params.entityTypes };
    }

    if (params.tags?.length) {
      where.tags = { hasSome: params.tags };
    }

    if (params.locale) {
      where.locale = params.locale;
    }

    const [data, total] = await Promise.all([
      this.prisma.searchIndex.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.searchIndex.count({ where }),
    ]);

    const durationMs = Date.now() - startTime;

    await this.trackQuery({
      tenantId: params.tenantId,
      query: params.query,
      resultsCount: data.length,
      totalHits: total,
      durationMs,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit), durationMs };
  }

  async autocomplete(tenantId: string, prefix: string, entityTypes?: string[], limit = 10) {
    if (!prefix || prefix.length < 1) return [];

    const where: any = {
      tenantId,
      published: true,
      title: { startsWith: prefix, mode: 'insensitive' },
    };

    if (entityTypes?.length) {
      where.entityType = { in: entityTypes };
    }

    const results = await this.prisma.searchIndex.findMany({
      where,
      select: { id: true, title: true, entityType: true, entityId: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return results;
  }

  async getFacets(tenantId: string, query?: string) {
    const where: any = { tenantId, published: true };

    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [entityTypes, allTags] = await Promise.all([
      this.prisma.searchIndex.groupBy({
        by: ['entityType'],
        where,
        _count: true,
      }),
      this.prisma.searchIndex.findMany({
        where,
        select: { tags: true },
      }),
    ]);

    const tagCounts = new Map<string, number>();
    for (const doc of allTags) {
      for (const tag of doc.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    return {
      entityTypes: entityTypes.map((e) => ({ type: e.entityType, count: e._count })),
      tags: Array.from(tagCounts.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 50),
    };
  }

  private async trackQuery(data: {
    tenantId: string; query: string; resultsCount: number; totalHits: number; durationMs: number;
  }) {
    if (!data.query) return;
    try {
      await this.prisma.searchQuery.create({ data: data as any });
    } catch {}
  }

  async getPopularSearches(tenantId: string, days = 7, limit = 20) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const results = await this.prisma.searchQuery.groupBy({
      by: ['query'],
      where: {
        tenantId,
        createdAt: { gte: since },
        query: { not: '' },
      },
      _count: true,
      orderBy: { _count: { query: 'desc' } },
      take: limit,
    });

    return results.map((r) => ({ query: r.query, count: r._count }));
  }

  async getNoResultQueries(tenantId: string, days = 7, limit = 20) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.prisma.searchQuery.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        resultsCount: 0,
        query: { not: '' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ─── Synonyms ────────────────────────────────────────────────

  async createSynonym(tenantId: string, data: { terms: string[]; type?: string }) {
    return this.prisma.searchSynonym.create({ data: { tenantId, ...data } as any });
  }

  async getSynonyms(tenantId: string) {
    return this.prisma.searchSynonym.findMany({ where: { tenantId } });
  }

  async deleteSynonym(id: string) {
    return this.prisma.searchSynonym.delete({ where: { id } });
  }
}
