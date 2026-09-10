import {
  Controller, Get, Post, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Search - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/search', version: '1' })
export class SearchAppController {
  constructor(
    private readonly searchService: SearchService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  @Post('index')
  @ApiOperation({ summary: 'Index a document for current tenant' })
  async index(@CurrentUser('id') userId: string, @Body() data: {
    entityType: string; entityId: string;
    title?: string; content?: string; tags?: string[];
    metadata?: Record<string, any>; locale?: string;
  }) {
    const tenantId = await this.getTenantId(userId);
    return this.searchService.index({ ...data, tenantId });
  }

  @Delete('index/:entityType/:entityId')
  @ApiOperation({ summary: 'Remove from index for current tenant' })
  async remove(@CurrentUser('id') userId: string, @Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.searchService.remove(tenantId, entityType, entityId);
  }

  @Post('index/bulk')
  @ApiOperation({ summary: 'Bulk index documents for current tenant' })
  async bulkIndex(@CurrentUser('id') userId: string, @Body() data: {
    entries: Array<{ entityType: string; entityId: string; title?: string; content?: string; tags?: string[]; metadata?: Record<string, any> }>;
  }) {
    const tenantId = await this.getTenantId(userId);
    const entriesWithTenant = data.entries.map(e => ({ ...e, tenantId }));
    return this.searchService.bulkIndex(entriesWithTenant);
  }

  @Post('synonyms')
  @ApiOperation({ summary: 'Create search synonym for current tenant' })
  async createSynonym(@CurrentUser('id') userId: string, @Body() data: { terms: string[]; type?: string }) {
    const tenantId = await this.getTenantId(userId);
    return this.searchService.createSynonym(tenantId, data);
  }

  @Delete('synonyms/:id')
  @ApiOperation({ summary: 'Delete search synonym' })
  async deleteSynonym(@Param('id') id: string) {
    return this.searchService.deleteSynonym(id);
  }
}