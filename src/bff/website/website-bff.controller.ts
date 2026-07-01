import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebsiteBffService } from './website-bff.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Website BFF')
@Public()
@Controller({ path: 'bff/website', version: '1' })
export class WebsiteBffController {
  constructor(private readonly bff: WebsiteBffService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Get public categories for website' })
  getCategories() {
    return this.bff.getPublicCategories();
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured tenants for landing page' })
  getFeatured() {
    return this.bff.getFeaturedTenants();
  }

  @Get('pricing')
  @ApiOperation({ summary: 'Get pricing plans' })
  getPricing() {
    return this.bff.getPricingPlans();
  }
}
