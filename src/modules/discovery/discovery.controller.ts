import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Discovery')
@Public()
@Controller({ path: 'discovery', version: '1' })
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('featured')
  @ApiOperation({ summary: 'Get featured/popular tenants' })
  getFeatured() {
    return this.discoveryService.getFeatured();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search tenants' })
  @ApiQuery({ name: 'q', required: true })
  search(@Query('q') query: string) {
    return this.discoveryService.search(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get discover categories' })
  getCategories() {
    return this.discoveryService.getCategories();
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Get nearby tenants' })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lng', required: true })
  getNearby(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.discoveryService.getNearby(parseFloat(lat), parseFloat(lng));
  }
}
