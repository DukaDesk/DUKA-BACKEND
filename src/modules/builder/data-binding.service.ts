import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface DataBinding {
  source: 'static' | 'context' | 'api' | 'query';
  path?: string;
  url?: string;
  method?: string;
  query?: string;
  defaultValue?: any;
  transform?: string;
}

@Injectable()
export class DataBindingService {
  private readonly logger = new Logger(DataBindingService.name);

  constructor(private prisma: PrismaService) {}

  async resolve(binding: DataBinding, context: Record<string, any>, tenantId: string): Promise<any> {
    try {
      switch (binding.source) {
        case 'static':
          return binding.defaultValue;
        case 'context':
          return this.resolveFromContext(binding.path, context);
        case 'api':
          return this.resolveFromApi(binding);
        case 'query':
          return this.resolveFromQuery(binding, tenantId, context);
        default:
          return binding.defaultValue;
      }
    } catch (err: any) {
      this.logger.warn(`Data binding resolution failed: ${err.message}`);
      return binding.defaultValue;
    }
  }

  async resolveAll(
    bindings: Record<string, DataBinding>,
    context: Record<string, any>,
    tenantId: string,
  ): Promise<Record<string, any>> {
    const entries = Object.entries(bindings);
    const results = await Promise.all(
      entries.map(([key, binding]) => this.resolve(binding, context, tenantId).then((value) => [key, value])),
    );
    return Object.fromEntries(results);
  }

  private resolveFromContext(path: string | undefined, context: Record<string, any>): any {
    if (!path) return context;
    return path.split('.').reduce((current, key) => (current ? current[key] : undefined), context);
  }

  private async resolveFromApi(binding: DataBinding): Promise<any> {
    if (!binding.url) return binding.defaultValue;
    try {
      const response = await fetch(binding.url, {
        method: binding.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return binding.defaultValue;
      return response.json();
    } catch {
      return binding.defaultValue;
    }
  }

  private async resolveFromQuery(binding: DataBinding, tenantId: string, context: Record<string, any>): Promise<any> {
    if (!binding.query) return binding.defaultValue;

    const resolvedQuery = this.interpolate(binding.query, context);

    switch (resolvedQuery) {
      case 'products':
        return this.prisma.product.findMany({ where: { tenantId, isActive: true }, take: 50 });
      case 'products.latest':
        return this.prisma.product.findMany({ where: { tenantId, isActive: true }, orderBy: { createdAt: 'desc' }, take: 10 });
      case 'categories':
        return this.prisma.category.findMany({ where: { tenantId, isActive: true } });
      case 'pages':
        return this.prisma.page.findMany({ where: { tenantId, isActive: true } });
      case 'booking_services':
        return this.prisma.bookingService.findMany({ where: { tenantId, isActive: true } });
      default:
        this.logger.warn(`Unknown data query: ${resolvedQuery}`);
        return binding.defaultValue;
    }
  }

  private interpolate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
      const value = this.resolveFromContext(path, context);
      return value !== undefined ? String(value) : '';
    });
  }
}
