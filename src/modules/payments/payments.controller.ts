import {
  Controller, Get, Post, Body, Param, Query, Headers, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Payments')
@Controller({ version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ─── Payment Intents ─────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('tenants/:tenantId/payments/initialize')
  @ApiOperation({ summary: 'Initialize a payment with provider' })
  initializePayment(
    @Param('tenantId') tenantId: string,
    @Body() data: { provider: string; amount: number; currency?: string; customer: { email: string; name?: string; phone?: string }; metadata?: any; callbackUrl?: string },
  ) {
    return this.paymentsService.initializePayment(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('payments/:intentId/verify')
  @ApiOperation({ summary: 'Verify payment intent with provider' })
  verifyPayment(@Param('intentId') intentId: string) {
    return this.paymentsService.verifyPayment(intentId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tenants/:tenantId/payments')
  @ApiOperation({ summary: 'List payment intents' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'provider', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getIntents(@Param('tenantId') tenantId: string, @Query() query: any) {
    return this.paymentsService.getIntents(tenantId, query);
  }

  // ─── Refunds ─────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('payments/:intentId/refund')
  @ApiOperation({ summary: 'Process a refund (partial or full)' })
  processRefund(@Param('intentId') intentId: string, @Body() data?: { amount?: number; reason?: string }) {
    return this.paymentsService.processRefund(intentId, data);
  }

  // ─── Settlements ─────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('tenants/:tenantId/payments/settlements')
  @ApiOperation({ summary: 'Record a settlement entry' })
  recordSettlement(@Param('tenantId') tenantId: string, @Body() data: { provider: string; reference: string; amount: number; fees?: number; currency?: string; periodStart?: string; periodEnd?: string }) {
    return this.paymentsService.recordSettlement({ tenantId, ...data });
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('payments/settlements/:id/confirm')
  @ApiOperation({ summary: 'Confirm a settlement as received' })
  confirmSettlement(@Param('id') id: string) {
    return this.paymentsService.confirmSettlement(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tenants/:tenantId/payments/settlements')
  @ApiOperation({ summary: 'List settlements' })
  @ApiQuery({ name: 'status', required: false })
  getSettlements(@Param('tenantId') tenantId: string, @Query('status') status?: string) {
    return this.paymentsService.getSettlements(tenantId, { status });
  }

  // ─── Transactions ────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tenants/:tenantId/payments/transactions')
  @ApiOperation({ summary: 'List payment transactions' })
  @ApiQuery({ name: 'type', required: false, description: 'charge | refund' })
  @ApiQuery({ name: 'status', required: false })
  getTransactions(@Param('tenantId') tenantId: string, @Query() query: any) {
    return this.paymentsService.getTransactions(tenantId, query);
  }

  // ─── Provider Health ─────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('payments/health/:provider')
  @ApiOperation({ summary: 'Check health of a payment provider' })
  checkProviderHealth(@Param('provider') provider: string) {
    return this.paymentsService.checkProviderHealth(provider);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('payments/health')
  @ApiOperation({ summary: 'Check health of all payment providers' })
  checkAllProviders() {
    return this.paymentsService.checkAllProviders();
  }

  // ─── Accounts ────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tenants/:tenantId/payments/accounts')
  @ApiOperation({ summary: 'Get payment accounts for tenant' })
  getAccounts(@Param('tenantId') tenantId: string) {
    return this.paymentsService.getPaymentAccounts(tenantId);
  }

  // ─── Webhooks ────────────────────────────────

  @Public()
  @Post('payments/webhook/:provider')
  @ApiOperation({ summary: 'Provider webhook endpoint (public)' })
  processWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Headers('x-webhook-signature') signature: string,
    @Headers('verif-hash') hash: string,
    @Headers('x-paystack-signature') paystackSignature: string,
  ) {
    const sig = signature || hash || paystackSignature || '';
    return this.paymentsService.processWebhook(provider, payload, sig);
  }
}
