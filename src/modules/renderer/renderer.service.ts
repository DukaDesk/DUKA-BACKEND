import { Injectable, NotFoundException } from '@nestjs/common';
import { ActiveReleaseService } from '../../shared/releases/active-release.service';

@Injectable()
export class RendererService {
  constructor(private releases: ActiveReleaseService) {}

  /**
   * Canonical public definition reader (B3).
   * Always serves the active production release — no owner-page fallback.
   */
  async getAppDefinition(tenantId: string, version?: string) {
    try {
      const result = await this.releases.getActiveRelease(tenantId, { version });
      return result.payload;
    } catch (err: any) {
      if (err?.status === 404 || err?.code === 'NO_PUBLISHED_RELEASE' || err?.code === 'TENANT_NOT_FOUND' || err?.code === 'RELEASE_NOT_FOUND') {
        throw err;
      }
      // Typed no-published-release for any resolution miss
      throw new NotFoundException({
        code: 'NO_PUBLISHED_RELEASE',
        message: 'No published release for this app',
      });
    }
  }

  async resolveBySlug(slug: string) {
    const tenant = await this.releases.resolveTenant(slug);
    if (!tenant || tenant.status !== 'published') {
      throw new NotFoundException('Tenant not found');
    }
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logo: tenant.logo,
      status: tenant.status,
    };
  }
}
