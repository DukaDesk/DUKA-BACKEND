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

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tenants/:tenantId/payments/accounts')
  @ApiOperation({ summary: 'Get payment accounts for tenant' })
  getAccounts(@Param('tenantId') tenantId: string) {
    return this.paymentsService.getPaymentAccounts(tenantId);
  }

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
