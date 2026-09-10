import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CommerceService } from './commerce.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Commerce - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/commerce', version: '1' })
export class CommerceAppController {
  constructor(
    private readonly commerceService: CommerceService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  // ─── Categories ───────────────────────────────

  @Post('categories')
  @ApiOperation({ summary: 'Create category' })
  async createCategory(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.commerceService.createCategory(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('categories/:id')
  @ApiOperation({ summary: 'Update category' })
  updateCategory(@Param('id') id: string, @Body() data: any) {
    return this.commerceService.updateCategory(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete category' })
  deleteCategory(@Param('id') id: string) {
    return this.commerceService.deleteCategory(id);
  }

  // ─── Products ─────────────────────────────────

  @Post('products')
  @ApiOperation({ summary: 'Create product with variants' })
  async createProduct(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.commerceService.createProduct(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('products/:id')
  @ApiOperation({ summary: 'Update product' })
  updateProduct(@Param('id') id: string, @Body() data: any) {
    return this.commerceService.updateProduct(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete product' })
  deleteProduct(@Param('id') id: string) {
    return this.commerceService.deleteProduct(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('products/:id/extended-pricing')
  @ApiOperation({ summary: 'Set multi-currency pricing for product' })
  setExtendedPricing(@Param('id') id: string, @Body() pricing: Record<string, { price: number; compareAtPrice?: number }>) {
    return this.commerceService.setExtendedPricing(id, pricing);
  }

  // ─── Inventory ────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('products/:id/reserve')
  @ApiOperation({ summary: 'Reserve inventory' })
  reserveInventory(
    @Param('id') id: string,
    @Body() data: { quantity: number; variantId?: string; sessionId?: string; userId?: string; ttlMinutes?: number },
  ) {
    return this.commerceService.reserveInventory(id, data.quantity, data.variantId, data.sessionId, data.userId, data.ttlMinutes);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('reservations/:id/release')
  @ApiOperation({ summary: 'Release inventory reservation' })
  releaseReservation(@Param('id') id: string) {
    return this.commerceService.releaseReservation(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('reservations/:id/confirm')
  @ApiOperation({ summary: 'Confirm reservation and deduct inventory' })
  confirmReservation(@Param('id') id: string) {
    return this.commerceService.confirmReservation(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('products/:id/adjust-stock')
  @ApiOperation({ summary: 'Adjust stock level (positive or negative delta)' })
  adjustStock(@Param('id') id: string, @Body() data: { delta: number; variantId?: string }) {
    return this.commerceService.adjustStock(id, data.delta, data.variantId);
  }

  // ─── Variants ─────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('products/:productId/variants')
  @ApiOperation({ summary: 'Add variant to product' })
  createVariant(@Param('productId') productId: string, @Body() data: any) {
    return this.commerceService.createVariant(productId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('variants/:id')
  @ApiOperation({ summary: 'Update variant' })
  updateVariant(@Param('id') id: string, @Body() data: any) {
    return this.commerceService.updateVariant(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('variants/:id')
  @ApiOperation({ summary: 'Delete variant' })
  deleteVariant(@Param('id') id: string) {
    return this.commerceService.deleteVariant(id);
  }

  // ─── Cart ─────────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('cart')
  @ApiOperation({ summary: 'Get or create cart' })
  async getOrCreateCart(@CurrentUser('id') userId: string, @Body() data: { userId?: string; sessionId?: string }) {
    const tenantId = await this.getTenantId(userId);
    return this.commerceService.getOrCreateCart(tenantId, data.userId, data.sessionId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('cart/:id')
  @ApiOperation({ summary: 'Get cart with items' })
  getCart(@Param('id') id: string) {
    return this.commerceService.getCart(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('cart/:id/items')
  @ApiOperation({ summary: 'Add item to cart' })
  addToCart(@Param('id') id: string, @Body() data: { productId: string; quantity: number; variantId?: string }) {
    return this.commerceService.addToCart(id, data.productId, data.quantity, data.variantId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Patch('cart/items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  updateCartItem(@Param('itemId') itemId: string, @Body() data: { quantity: number }) {
    return this.commerceService.updateCartItem(itemId, data.quantity);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('cart/items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  removeFromCart(@Param('itemId') itemId: string) {
    return this.commerceService.removeFromCart(itemId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('cart/:id/coupon')
  @ApiOperation({ summary: 'Apply coupon to cart' })
  applyCoupon(@Param('id') id: string, @Body() data: { code: string }) {
    return this.commerceService.applyCoupon(id, data.code);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('cart/:id/coupon')
  @ApiOperation({ summary: 'Remove coupon from cart' })
  removeCoupon(@Param('id') id: string) {
    return this.commerceService.removeCoupon(id);
  }

  // ─── Checkout ─────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('cart/:id/checkout')
  @ApiOperation({ summary: 'Convert cart to order' })
  checkout(@Param('id') id: string, @Body() data: { customerName?: string; customerEmail?: string; customerPhone?: string; notes?: string }) {
    return this.commerceService.checkout(id, data);
  }

  // ─── Orders ───────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('orders')
  @ApiOperation({ summary: 'List orders' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getOrders(@CurrentUser('id') userId: string, @Query() query: any) {
    const tenantId = await this.getTenantId(userId);
    return this.commerceService.getOrders(tenantId, query);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order detail' })
  getOrder(@Param('id') id: string) {
    return this.commerceService.getOrder(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('orders/:id/status')
  @ApiOperation({ summary: 'Update order status with transition validation' })
  updateOrderStatus(@Param('id') id: string, @Body() data: { status: string; reason?: string }) {
    return this.commerceService.updateOrderStatus(id, data.status, data.reason);
  }

  // ─── Coupons ──────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('coupons')
  @ApiOperation({ summary: 'Create coupon' })
  async createCoupon(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.commerceService.createCoupon(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('coupons')
  @ApiOperation({ summary: 'List coupons' })
  async getCoupons(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.commerceService.getCoupons(tenantId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('coupons/:id')
  @ApiOperation({ summary: 'Update coupon' })
  updateCoupon(@Param('id') id: string, @Body() data: any) {
    return this.commerceService.updateCoupon(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('coupons/:id')
  @ApiOperation({ summary: 'Delete coupon' })
  deleteCoupon(@Param('id') id: string) {
    return this.commerceService.deleteCoupon(id);
  }

  // ─── Fulfillments ─────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('orders/:orderId/fulfillments')
  @ApiOperation({ summary: 'Create fulfillment' })
  createFulfillment(@Param('orderId') orderId: string, @Body() data: any) {
    return this.commerceService.createFulfillment(orderId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('orders/:orderId/fulfillments')
  @ApiOperation({ summary: 'List fulfillments for order' })
  getFulfillments(@Param('orderId') orderId: string) {
    return this.commerceService.getFulfillments(orderId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Patch('fulfillments/:id')
  @ApiOperation({ summary: 'Update fulfillment status' })
  updateFulfillment(@Param('id') id: string, @Body() data: any) {
    return this.commerceService.updateFulfillment(id, data);
  }

  // ─── Tax Rules ─────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('tax-rules')
  @ApiOperation({ summary: 'Create tax rule' })
  async createTaxRule(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.commerceService.createTaxRule(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tax-rules')
  @ApiOperation({ summary: 'List tax rules' })
  async getTaxRules(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.commerceService.getTaxRules(tenantId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('tax-rules/:id')
  @ApiOperation({ summary: 'Update tax rule' })
  updateTaxRule(@Param('id') id: string, @Body() data: any) {
    return this.commerceService.updateTaxRule(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('tax-rules/:id')
  @ApiOperation({ summary: 'Delete tax rule' })
  deleteTaxRule(@Param('id') id: string) {
    return this.commerceService.deleteTaxRule(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tax-calc')
  @ApiOperation({ summary: 'Calculate tax for subtotal' })
  @ApiQuery({ name: 'subtotal', required: true })
  @ApiQuery({ name: 'region', required: false })
  async calculateTax(@CurrentUser('id') userId: string, @Query('subtotal') subtotal: string, @Query('region') region?: string) {
    const tenantId = await this.getTenantId(userId);
    return this.commerceService.calculateTax(tenantId, parseFloat(subtotal || '0'), region);
  }
}