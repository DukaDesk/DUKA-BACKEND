import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Payments - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/payments', version: '1' })
export class PaymentsAppController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  // ─── Payment Intents ─────────────────────────

  @Post('initialize')
  @ApiOperation({ summary: 'Initialize a payment with provider for current tenant' })
  async initializePayment(@CurrentUser('id') userId: string, @Body() data: {
    provider: string; amount: number; currency?: string;
    customer: { email: string; name?: string; phone?: string };
    metadata?: any; callbackUrl?: string;
  }) {
    const tenantId = await this.getTenantId(userId);
    return this.paymentsService.initializePayment(tenantId, data);
  }

  @Post(':intentId/verify')
  @ApiOperation({ summary: 'Verify payment intent with provider' })
  async verifyPayment(@Param('intentId') intentId: string) {
    return this.paymentsService.verifyPayment(intentId);
  }

  // ─── Refunds ─────────────────────────────────

  @Post(':intentId/refund')
  @ApiOperation({ summary: 'Process a refund (partial or full)' })
  async processRefund(@Param('intentId') intentId: string, @Body() data?: { amount?: number; reason?: string }) {
    return this.paymentsService.processRefund(intentId, data);
  }

  // ─── Settlements ─────────────────────────────

  @Post('settlements')
  @ApiOperation({ summary: 'Record a settlement entry for current tenant' })
  async recordSettlement(@CurrentUser('id') userId: string, @Body() data: {
    provider: string; reference: string; amount: number; fees?: number; currency?: string; periodStart?: string; periodEnd?: string;
  }) {
    const tenantId = await this.getTenantId(userId);
    return this.paymentsService.recordSettlement({ tenantId, ...data });
  }

  @Post('settlements/:id/confirm')
  @ApiOperation({ summary: 'Confirm a settlement as received' })
  async confirmSettlement(@Param('id') id: string) {
    return this.paymentsService.confirmSettlement(id);
  }
}