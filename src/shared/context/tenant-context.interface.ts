export interface TenantContext {
  tenantId: string;
  slug: string;
  name?: string;
  status?: string;
  features?: Record<string, boolean>;
  config?: Record<string, any>;
  locale?: string;
  currency?: string;
  timezone?: string;
}
