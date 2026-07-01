import { Injectable, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { TenantContext } from './tenant-context.interface';

@Injectable()
export class TenantContextService implements OnModuleInit {
  private storage: AsyncLocalStorage<TenantContext>;

  onModuleInit() {
    this.storage = new AsyncLocalStorage<TenantContext>();
  }

  run(context: TenantContext, callback: () => void): void {
    this.storage.run(context, callback);
  }

  get(): TenantContext | undefined {
    return this.storage.getStore();
  }

  getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  getSlug(): string | undefined {
    return this.storage.getStore()?.slug;
  }

  getFeature(name: string): boolean {
    return this.storage.getStore()?.features?.[name] ?? false;
  }
}
