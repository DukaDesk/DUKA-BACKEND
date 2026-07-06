import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { PaymentAdapter, RefundRequest } from './providers/payment-adapter.interface';
import { PaystackAdapter } from './providers/paystack.adapter';
import { FlutterwaveAdapter } from './providers/flutterwave.adapter';
import { StripeAdapter } from './providers/stripe.adapter';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private providers: Map<string, PaymentAdapter> = new Map();

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    paystack: PaystackAdapter,
    flutterwave: FlutterwaveAdapter,
    stripe: StripeAdapter,
  ) {
    this.providers.set('paystack', paystack);
    this.providers.set('flutterwave', flutterwave);
    this.providers.set('stripe', stripe);
  }

  async initializePayment(tenantId: string, data: {
    provider: string;
    amount: number;
    currency?: string;
    customer: { email: string; name?: string; phone?: string };
    metadata?: any;
    callbackUrl?: string;
  }) {
    const account = await this.prisma.tenantPaymentAccount.findFirst({
      where: { tenantId, provider: { slug: data.provider }, status: 'active', isDefault: true },
      include: { provider: true },
    });
    if (!account) throw new BadRequestException(`No active ${data.provider} account for this tenant`);

    const adapter = this.providers.get(data.provider);
    if (!adapter) throw new BadRequestException(`Unsupported provider: ${data.provider}`);

    const reference = `${tenantId.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const intent = await this.prisma.paymentIntent.create({
      data: {
        tenantId,
        accountId: account.id,
        provider: data.provider,
        amount: data.amount,
        currency: data.currency || 'NGN',
        status: 'created',
        customer: data.customer as any,
        metadata: data.metadata as any,
      },
    });

    const result = await adapter.initializePayment({
      amount: data.amount,
      currency: data.currency || 'NGN',
      customer: data.customer,
      reference,
      metadata: { ...data.metadata, intentId: intent.id },
      callbackUrl: data.callbackUrl,
    });

    if (result.success) {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { externalId: result.providerRef, status: 'pending' },
      });

      await this.prisma.paymentTransaction.create({
        data: {
          intentId: intent.id,
          type: 'charge',
          externalRef: result.providerRef,
          amount: data.amount,
          status: 'pending',
        },
      });
    } else {
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'failed' },
      });
    }

    return { intentId: intent.id, ...result };
  }

  async verifyPayment(intentId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw new NotFoundException('Payment intent not found');
    if (!intent.externalId) throw new BadRequestException('No external reference');

    const adapter = this.providers.get(intent.provider);
    if (!adapter) throw new BadRequestException(`Unsupported provider: ${intent.provider}`);

    const result = await adapter.verifyPayment(intent.externalId);

    await this.prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: result.success ? 'completed' : 'failed' },
    });

    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { intentId, type: 'charge' },
      orderBy: { createdAt: 'desc' },
    });

    if (transaction) {
      await this.prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: result.success ? 'completed' : 'failed', fees: result.fees, netAmount: result.netAmount, providerResponse: result.providerData as any },
      });
    }

    await this.prisma.financialEvent.create({
      data: {
        tenantId: intent.tenantId,
        type: result.success ? 'payment_received' : 'payment_failed',
        amount: intent.amount,
        currency: intent.currency,
        transactionId: transaction?.id,
        metadata: { intentId, provider: intent.provider } as any,
      },
    });

    if (result.success) {
      await this.eventBus.publish({
        type: 'PaymentCompleted',
        aggregateId: intentId,
        data: { intentId, tenantId: intent.tenantId, amount: intent.amount, provider: intent.provider },
      });
    }

    return { intentId, success: result.success, status: result.status, amount: result.amount, fees: result.fees };
  }

  // ─── Refunds ──────────────────────────────────

  async processRefund(intentId: string, data?: { amount?: number; reason?: string }) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw new NotFoundException('Payment intent not found');
    if (intent.status !== 'completed') throw new BadRequestException('Can only refund completed payments');

    const adapter = this.providers.get(intent.provider);
    if (!adapter) throw new BadRequestException(`Unsupported provider: ${intent.provider}`);

    const refundRequest: RefundRequest = {
      reference: intent.externalId!,
      amount: data?.amount || undefined,
      reason: data?.reason,
    };

    const result = await adapter.refundPayment(refundRequest);

    await this.prisma.paymentTransaction.create({
      data: {
        intentId,
        type: 'refund',
        externalRef: result.refundRef,
        amount: result.amount,
        status: result.success ? 'completed' : 'failed',
        providerResponse: result as any,
      },
    });

    if (result.success) {
      await this.prisma.paymentIntent.update({
        where: { id: intentId },
        data: { status: 'refunded' },
      });

      await this.prisma.financialEvent.create({
        data: {
          tenantId: intent.tenantId,
          type: 'refund_issued',
          amount: -result.amount,
          currency: intent.currency,
          transactionId: result.refundRef,
          metadata: { intentId, provider: intent.provider, reason: data?.reason } as any,
        },
      });

      await this.eventBus.publish({
        type: 'RefundProcessed',
        aggregateId: intentId,
        data: { intentId, tenantId: intent.tenantId, amount: result.amount, provider: intent.provider },
      });
    }

    return { intentId, ...result };
  }

  // ─── Settlements ──────────────────────────────

  async recordSettlement(data: {
    tenantId: string;
    provider: string;
    reference: string;
    amount: number;
    fees?: number;
    currency?: string;
    periodStart?: string;
    periodEnd?: string;
  }) {
    const settlement = await this.prisma.settlement.create({
      data: {
        tenantId: data.tenantId,
        provider: data.provider,
        reference: data.reference,
        amount: data.amount,
        fees: data.fees || 0,
        netAmount: data.amount - (data.fees || 0),
        currency: data.currency || 'NGN',
        status: 'pending',
        periodStart: data.periodStart ? new Date(data.periodStart) : null,
        periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
      },
    });

    return settlement;
  }

  async confirmSettlement(settlementId: string) {
    const settlement = await this.prisma.settlement.findUnique({ where: { id: settlementId } });
    if (!settlement) throw new NotFoundException('Settlement not found');

    const updated = await this.prisma.settlement.update({
      where: { id: settlementId },
      data: { status: 'settled', settledAt: new Date() },
    });

    await this.prisma.financialEvent.create({
      data: {
        tenantId: settlement.tenantId,
        type: 'settlement_received',
        amount: settlement.netAmount,
        currency: settlement.currency,
        settlementId: settlement.id,
        metadata: { provider: settlement.provider, reference: settlement.reference } as any,
      },
    });

    return updated;
  }

  async getSettlements(tenantId: string, query?: { status?: string; page?: number; limit?: number }) {
    const where: any = { tenantId };
    if (query?.status) where.status = query.status;

    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.settlement.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.settlement.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ─── Provider Health Checks ────────────────────

  async checkProviderHealth(provider: string) {
    const adapter = this.providers.get(provider);
    if (!adapter) throw new BadRequestException(`Unsupported provider: ${provider}`);
    return adapter.healthCheck();
  }

  async checkAllProviders() {
    const results: Record<string, any> = {};
    for (const [name, adapter] of this.providers) {
      results[name] = await adapter.healthCheck();
    }
    return results;
  }

  // ─── Transactions ─────────────────────────────

  async getTransactions(tenantId: string, query?: { type?: string; status?: string; page?: number; limit?: number }) {
    const where: any = { intent: { tenantId } };
    if (query?.type) where.type = query.type;
    if (query?.status) where.status = query.status;

    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where,
        include: { intent: { select: { id: true, provider: true, amount: true, currency: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ─── Webhooks ─────────────────────────────────

  async processWebhook(provider: string, payload: any, signature: string) {
    const adapter = this.providers.get(provider);
    if (!adapter) throw new BadRequestException(`Unsupported provider: ${provider}`);

    await this.prisma.webhookEvent.create({
      data: {
        provider,
        eventType: payload.event || payload['event.type'] || 'unknown',
        rawPayload: payload as any,
        verified: false,
        processed: false,
      },
    });

    const result = await adapter.processWebhook(payload, signature);
    this.logger.log(`Webhook processed: ${provider} ${result.event}`);

    if (result.status === 'successful' || result.status === 'success') {
      await this.prisma.paymentIntent.updateMany({
        where: { externalId: result.reference, provider },
        data: { status: 'completed' },
      });
    }

    return { received: true, event: result.event };
  }

  // ─── Accounts ─────────────────────────────────

  async getPaymentAccounts(tenantId: string) {
    return this.prisma.tenantPaymentAccount.findMany({
      where: { tenantId },
      include: { provider: { select: { id: true, name: true, slug: true } } },
    });
  }

  async getIntents(tenantId: string, query: any) {
    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.provider) where.provider = query.provider;

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.paymentIntent.findMany({
        where,
        include: { transactions: { orderBy: { createdAt: 'desc' }, take: 5 } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.paymentIntent.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
}
