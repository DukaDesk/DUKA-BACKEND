import {
  Controller, Get, Post, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Search & Discovery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('search/index')
  @ApiOperation({ summary: 'Index a document' })
  index(@Body() data: {
    tenantId: string; entityType: string; entityId: string;
    title?: string; content?: string; tags?: string[];
    metadata?: Record<string, any>; locale?: string;
  }) {
    return this.searchService.index(data);
  }

  @Delete('search/index/:entityType/:entityId')
  @ApiOperation({ summary: 'Remove from index' })
  @ApiQuery({ name: 'tenantId', required: true })
  remove(
    @Query('tenantId') tenantId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.searchService.remove(tenantId, entityType, entityId);
  }

  @Post('search/index/bulk')
  @ApiOperation({ summary: 'Bulk index documents' })
  bulkIndex(@Body() data: { entries: Array<{
    tenantId: string; entityType: string; entityId: string;
    title?: string; content?: string; tags?: string[];
    metadata?: Record<string, any>;
  }> }) {
    return this.searchService.bulkIndex(data.entries);
  }

  @Get('search')
  @ApiOperation({ summary: 'Full-text search' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'query', required: true })
  search(
    @Query('tenantId') tenantId: string,
    @Query('query') query: string,
    @Query('entityTypes') entityTypes?: string,
    @Query('tags') tags?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.search({
      tenantId,
      query,
      entityTypes: entityTypes?.split(','),
      tags: tags?.split(','),
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('search/autocomplete')
  @ApiOperation({ summary: 'Autocomplete suggestions' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'prefix', required: true })
  autocomplete(
    @Query('tenantId') tenantId: string,
    @Query('prefix') prefix: string,
    @Query('entityTypes') entityTypes?: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.autocomplete(
      tenantId, prefix,
      entityTypes?.split(','),
      limit ? parseInt(limit) : 10,
    );
  }

  @Get('search/facets')
  @ApiOperation({ summary: 'Get search facets' })
  @ApiQuery({ name: 'tenantId', required: true })
  getFacets(
    @Query('tenantId') tenantId: string,
    @Query('query') query?: string,
  ) {
    return this.searchService.getFacets(tenantId, query);
  }

  @Get('search/analytics/popular')
  @ApiOperation({ summary: 'Popular search terms' })
  @ApiQuery({ name: 'tenantId', required: true })
  getPopularSearches(
    @Query('tenantId') tenantId: string,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.getPopularSearches(
      tenantId,
      days ? parseInt(days) : 7,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('search/analytics/no-results')
  @ApiOperation({ summary: 'Queries with no results' })
  @ApiQuery({ name: 'tenantId', required: true })
  getNoResultQueries(
    @Query('tenantId') tenantId: string,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.getNoResultQueries(
      tenantId,
      days ? parseInt(days) : 7,
      limit ? parseInt(limit) : 20,
    );
  }

  @Post('search/synonyms')
  @ApiOperation({ summary: 'Create search synonym' })
  createSynonym(
    @Query('tenantId') tenantId: string,
    @Body() data: { terms: string[]; type?: string },
  ) {
    return this.searchService.createSynonym(tenantId, data);
  }

  @Get('search/synonyms')
  @ApiOperation({ summary: 'List search synonyms' })
  @ApiQuery({ name: 'tenantId', required: true })
  getSynonyms(@Query('tenantId') tenantId: string) {
    return this.searchService.getSynonyms(tenantId);
  }

  @Delete('search/synonyms/:id')
  @ApiOperation({ summary: 'Delete search synonym' })
  deleteSynonym(@Param('id') id: string) {
    return this.searchService.deleteSynonym(id);
  }
}
