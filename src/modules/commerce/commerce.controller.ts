import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CommerceService } from './commerce.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Commerce')
@Controller({ version: '1' })
export class CommerceController {
  constructor(private readonly commerceService: CommerceService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('tenants/:tenantId/categories')
  @ApiOperation({ summary: 'Create a category' })
  createCategory(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.commerceService.createCategory(tenantId, data);
  }

  @Public()
  @Get('tenants/:tenantId/categories')
  @ApiOperation({ summary: 'Get categories for a tenant' })
  getCategories(@Param('tenantId') tenantId: string) {
    return this.commerceService.getCategories(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put('categories/:id')
  @ApiOperation({ summary: 'Update a category' })
  updateCategory(@Param('id') id: string, @Body() data: any) {
    return this.commerceService.updateCategory(id, data);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete a category' })
  deleteCategory(@Param('id') id: string) {
    return this.commerceService.deleteCategory(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('tenants/:tenantId/products')
  @ApiOperation({ summary: 'Create a product' })
  createProduct(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.commerceService.createProduct(tenantId, data);
  }

  @Public()
  @Get('tenants/:tenantId/products')
  @ApiOperation({ summary: 'Get products for a tenant' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  getProducts(
    @Param('tenantId') tenantId: string,
    @Query() query: any,
  ) {
    return this.commerceService.getProducts(tenantId, query);
  }

  @Public()
  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  getProduct(@Param('id') id: string) {
    return this.commerceService.getProduct(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put('products/:id')
  @ApiOperation({ summary: 'Update a product' })
  updateProduct(@Param('id') id: string, @Body() data: any) {
    return this.commerceService.updateProduct(id, data);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete a product' })
  deleteProduct(@Param('id') id: string) {
    return this.commerceService.deleteProduct(id);
  }
}
