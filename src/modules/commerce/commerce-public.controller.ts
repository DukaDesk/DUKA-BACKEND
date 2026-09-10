import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CommerceService } from './commerce.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Commerce - Public (Consumer-Facing)')
@Controller({ version: '1' })
export class CommercePublicController {
  constructor(private readonly commerceService: CommerceService) {}

  // ─── Categories ───────────────────────────────

  @Public()
  @Get('merchants/:merchantId/categories')
  @ApiOperation({ summary: 'List categories (public)' })
  getCategories(@Param('merchantId') merchantId: string) {
    return this.commerceService.getCategories(merchantId);
  }

  // ─── Products ─────────────────────────────────

  @Public()
  @Get('merchants/:merchantId/products')
  @ApiOperation({ summary: 'List products with filter, sort, pagination (public)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'sort', required: false, description: 'price_asc | price_desc | name' })
  getProducts(@Param('merchantId') merchantId: string, @Query() query: any) {
    return this.commerceService.getProducts(merchantId, query);
  }

  @Public()
  @Get('products/:id')
  @ApiOperation({ summary: 'Get product with variants (public)' })
  getProduct(@Param('id') id: string) {
    return this.commerceService.getProduct(id);
  }

  @Public()
  @Get('product-types')
  @ApiOperation({ summary: 'List valid product types (public)' })
  getProductTypes() {
    return this.commerceService.getProductTypes();
  }

  @Public()
  @Get('merchants/:merchantId/products/type/:type')
  @ApiOperation({ summary: 'List products by type (physical/service/digital/donation/membership/event_ticket) (public)' })
  getProductsByType(@Param('merchantId') merchantId: string, @Param('type') type: string, @Query() query: any) {
    return this.commerceService.getProductsByType(merchantId, type, query);
  }

  @Public()
  @Get('products/:id/price')
  @ApiOperation({ summary: 'Get product price in specific currency (public)' })
  @ApiQuery({ name: 'currency', required: false })
  getPriceInCurrency(@Param('id') id: string, @Query('currency') currency?: string) {
    return this.commerceService.getPriceInCurrency(id, currency || 'NGN');
  }

  // ─── Inventory ────────────────────────────────

  @Public()
  @Get('products/:id/stock')
  @ApiOperation({ summary: 'Get available stock for product/variant (public)' })
  @ApiQuery({ name: 'variantId', required: false })
  getAvailableStock(@Param('id') id: string, @Query('variantId') variantId?: string) {
    return this.commerceService.getAvailableStock(id, variantId);
  }
}