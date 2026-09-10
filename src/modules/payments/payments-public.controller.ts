import {
  Controller, Get, Post, Body, Param, Query, Headers, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Payments - Public (Consumer-Facing)')
@Controller({ path: 'merchants/:merchantId/payments', version: '1' })
export class PaymentsPublicController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List payment intents for a merchant' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'provider', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getIntents(@Param('merchantId') merchantId: string, @Query() query: any) {
    return this.paymentsService.getIntents(merchantId, query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('settlements')
  @ApiOperation({ summary: 'List settlements for a merchant' })
  @ApiQuery({ name: 'status', required: false })
  getSettlements(@Param('merchantId') merchantId: string, @Query('status') status?: string) {
    return this.paymentsService.getSettlements(merchantId, { status });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('transactions')
  @ApiOperation({ summary: 'List payment transactions for a merchant' })
  @ApiQuery({ name: 'type', required: false, description: 'charge | refund' })
  @ApiQuery({ name: 'status', required: false })
  getTransactions(@Param('merchantId') merchantId: string, @Query() query: any) {
    return this.paymentsService.getTransactions(merchantId, query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('accounts')
  @ApiOperation({ summary: 'Get payment accounts for a merchant' })
  getAccounts(@Param('merchantId') merchantId: string) {
    return this.paymentsService.getPaymentAccounts(merchantId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('health/:provider')
  @ApiOperation({ summary: 'Check health of a payment provider' })
  checkProviderHealth(@Param('provider') provider: string) {
    return this.paymentsService.checkProviderHealth(provider);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('health')
  @ApiOperation({ summary: 'Check health of all payment providers' })
  checkAllProviders() {
    return this.paymentsService.checkAllProviders();
  }

  @Public()
  @Post('webhook/:provider')
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