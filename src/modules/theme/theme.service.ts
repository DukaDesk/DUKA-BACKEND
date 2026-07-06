import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { ThemeCompiler, CompiledThemeBundle, ThemeTokens } from './theme-compiler.service';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ThemeService {
  private readonly logger = new Logger(ThemeService.name);
  private readonly CACHE_TTL = 300;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private eventBus: EventBusService,
    private themeCompiler: ThemeCompiler,
  ) {}

  async getTheme(tenantId: string) {
    const cacheKey = `theme:${tenantId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }

    const theme = await this.prisma.theme.findUnique({ where: { tenantId } });
    if (!theme) return this.createDefault(tenantId);

    await this.redis.set(cacheKey, JSON.stringify(theme), this.CACHE_TTL);
    return theme;
  }

  async updateTheme(tenantId: string, dto: UpdateThemeDto) {
    const existing = await this.prisma.theme.findUnique({ where: { tenantId } });
    const nowVersion = (existing as any)?.version || 1;

    if (existing) {
      const snapshot = { ...existing };
      delete (snapshot as any).id;
      delete (snapshot as any).createdAt;
      delete (snapshot as any).updatedAt;

      const updated = await this.prisma.theme.update({
        where: { tenantId },
        data: {
          ...dto,
          version: { increment: 1 },
        },
      });

      await this.prisma.themeVersion.create({
        data: {
          themeId: existing.id,
          version: existing.version,
          snapshot: snapshot as any,
        },
      });

      await this.invalidateCache(tenantId);

      await this.eventBus.publish({
        type: 'ThemeUpdated',
        aggregateId: tenantId,
        data: { tenantId, version: updated.version },
      });

      return updated;
    }

    const created = await this.prisma.theme.create({
      data: {
        tenantId,
        ...dto,
        version: 1,
      },
    });

    await this.invalidateCache(tenantId);

    await this.eventBus.publish({
      type: 'ThemeCreated',
      aggregateId: tenantId,
      data: { tenantId, version: 1 },
    });

    return created;
  }

  async getVersionHistory(tenantId: string) {
    const theme = await this.prisma.theme.findUnique({ where: { tenantId } });
    if (!theme) return [];

    return this.prisma.themeVersion.findMany({
      where: { themeId: theme.id },
      orderBy: { version: 'desc' },
    });
  }

  async getVersion(tenantId: string, version: number) {
    const theme = await this.prisma.theme.findUnique({ where: { tenantId } });
    if (!theme) throw new NotFoundException('Theme not found');

    const themeVersion = await this.prisma.themeVersion.findUnique({
      where: { themeId_version: { themeId: theme.id, version } },
    });
    if (!themeVersion) throw new NotFoundException('Theme version not found');

    return themeVersion;
  }

  async restoreVersion(tenantId: string, version: number) {
    const theme = await this.prisma.theme.findUnique({ where: { tenantId } });
    if (!theme) throw new NotFoundException('Theme not found');

    const themeVersion = await this.prisma.themeVersion.findUnique({
      where: { themeId_version: { themeId: theme.id, version } },
    });
    if (!themeVersion) throw new NotFoundException('Theme version not found');

    const snapshot = themeVersion.snapshot as Record<string, any>;

    const currentSnapshot = { ...theme };
    delete (currentSnapshot as any).id;
    delete (currentSnapshot as any).createdAt;
    delete (currentSnapshot as any).updatedAt;

    await this.prisma.themeVersion.create({
      data: {
        themeId: theme.id,
        version: theme.version,
        snapshot: currentSnapshot as any,
      },
    });

    const restored = await this.prisma.theme.update({
      where: { tenantId },
      data: {
        primaryColor: snapshot.primaryColor,
        secondaryColor: snapshot.secondaryColor,
        backgroundColor: snapshot.backgroundColor,
        textColor: snapshot.textColor,
        fontFamily: snapshot.fontFamily,
        borderRadius: snapshot.borderRadius,
        logo: snapshot.logo,
        favicon: snapshot.favicon,
        darkPrimaryColor: snapshot.darkPrimaryColor,
        darkSecondaryColor: snapshot.darkSecondaryColor,
        darkBackgroundColor: snapshot.darkBackgroundColor,
        darkTextColor: snapshot.darkTextColor,
        typography: snapshot.typography || undefined,
        spacing: snapshot.spacing || undefined,
        custom: snapshot.custom || undefined,
        version: { increment: 1 },
      },
    });

    await this.invalidateCache(tenantId);

    await this.eventBus.publish({
      type: 'ThemeRestored',
      aggregateId: tenantId,
      data: { tenantId, fromVersion: theme.version, toVersion: version, newVersion: restored.version },
    });

    return restored;
  }

  async getCompiledBundle(tenantId: string): Promise<CompiledThemeBundle> {
    const theme = await this.getTheme(tenantId);
    return this.themeCompiler.compile(theme);
  }

  async getPreviewTokens(tenantId: string): Promise<ThemeTokens> {
    const theme = await this.getTheme(tenantId);
    return this.themeCompiler.compileForPreview(theme);
  }

  async resetToDefaults(tenantId: string) {
    const existing = await this.prisma.theme.findUnique({ where: { tenantId } });

    if (existing) {
      const snapshot = { ...existing };
      delete (snapshot as any).id;
      delete (snapshot as any).createdAt;
      delete (snapshot as any).updatedAt;

      await this.prisma.themeVersion.create({
        data: {
          themeId: existing.id,
          version: existing.version,
          snapshot: snapshot as any,
        },
      });
    }

    const defaults = await this.prisma.theme.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {
        primaryColor: '#0066FF',
        secondaryColor: '#00CC66',
        backgroundColor: '#FFFFFF',
        textColor: '#1A1A1A',
        fontFamily: 'Inter',
        borderRadius: '8px',
        logo: null,
        favicon: null,
        darkPrimaryColor: '#4D9FFF',
        darkSecondaryColor: '#33DD77',
        darkBackgroundColor: '#121212',
        darkTextColor: '#E0E0E0',
        typography: Prisma.JsonNull,
        spacing: Prisma.JsonNull,
        custom: Prisma.JsonNull,
        version: { increment: existing ? 1 : 0 },
      },
    });

    await this.invalidateCache(tenantId);

    return defaults;
  }

  private async createDefault(tenantId: string) {
    return this.prisma.theme.create({
      data: { tenantId },
    });
  }

  private async invalidateCache(tenantId: string) {
    await this.redis.del(`theme:${tenantId}`);
    await this.redis.del(`theme:bundle:${tenantId}`);
  }
}
