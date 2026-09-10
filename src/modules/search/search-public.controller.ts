import {
  Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Search - Public (Read-Only)')
@Controller({ path: 'search', version: '1' })
export class SearchPublicController {
  constructor(private readonly searchService: SearchService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'Full-text search' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'query', required: true })
  @ApiQuery({ name: 'entityTypes', required: false })
  @ApiQuery({ name: 'tags', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('autocomplete')
  @ApiOperation({ summary: 'Autocomplete suggestions' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'prefix', required: true })
  @ApiQuery({ name: 'entityTypes', required: false })
  @ApiQuery({ name: 'limit', required: false })
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('facets')
  @ApiOperation({ summary: 'Get search facets' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'query', required: false })
  getFacets(@Query('tenantId') tenantId: string, @Query('query') query?: string) {
    return this.searchService.getFacets(tenantId, query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('analytics/popular')
  @ApiOperation({ summary: 'Popular search terms' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'days', required: false })
  @ApiQuery({ name: 'limit', required: false })
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('analytics/no-results')
  @ApiOperation({ summary: 'Queries with no results' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'days', required: false })
  @ApiQuery({ name: 'limit', required: false })
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('synonyms')
  @ApiOperation({ summary: 'List search synonyms' })
  @ApiQuery({ name: 'tenantId', required: true })
  getSynonyms(@Query('tenantId') tenantId: string) {
    return this.searchService.getSynonyms(tenantId);
  }
}