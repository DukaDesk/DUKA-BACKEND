import { Injectable, Logger } from '@nestjs/common';
import { PaymentAdapter, PaymentRequest, PaymentResponse, VerifyResponse, RefundRequest, RefundResponse, HealthCheckResult } from './payment-adapter.interface';

@Injectable()
export class StripeAdapter implements PaymentAdapter {
  readonly provider = 'stripe';
  private readonly logger = new Logger(StripeAdapter.name);
  private readonly baseUrl = 'https://api.stripe.com/v1';

  private getSecretKey(): string {
    return process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
  }

  async initializePayment(request: PaymentRequest): Promise<PaymentResponse> {
    const secretKey = this.getSecretKey();
    try {
      const params = new URLSearchParams();
      params.append('amount', Math.round(request.amount * 100).toString());
      params.append('currency', request.currency.toLowerCase());
      params.append('payment_intent_data[setup_future_usage]', 'off_session');
      params.append('description', `Payment ${request.reference}`);
      params.append('metadata[reference]', request.reference);
      params.append('metadata[tenant_ref]', (request.metadata?.tenantId as string) || '');

      const res = await fetch(`${this.baseUrl}/checkout/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Stripe session creation failed');

      return {
        success: true,
        reference: request.reference,
        providerRef: data.id,
        authorizationUrl: data.url,
        status: 'pending',
      };
    } catch (err: any) {
      this.logger.error(`Stripe initializePayment error: ${err.message}`);
      return { success: false, reference: request.reference, providerRef: '', status: 'failed', message: err.message };
    }
  }

  async verifyPayment(reference: string): Promise<VerifyResponse> {
    const secretKey = this.getSecretKey();
    try {
      const res = await fetch(`${this.baseUrl}/checkout/sessions/${reference}`, {
        headers: { 'Authorization': `Bearer ${secretKey}` },
      });

      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Stripe verification failed');

      const paymentStatusMap: Record<string, string> = {
        complete: 'paid',
        open: 'pending',
        expired: 'expired',
        canceled: 'cancelled',
      };

      return {
        success: data.payment_status === 'paid',
        status: paymentStatusMap[data.status] || data.payment_status,
        amount: data.amount_total ? data.amount_total / 100 : 0,
        fees: 0,
        netAmount: data.amount_total ? data.amount_total / 100 : 0,
        customer: data.customer_details || {},
        providerData: data,
      };
    } catch (err: any) {
      this.logger.error(`Stripe verifyPayment error: ${err.message}`);
      throw err;
    }
  }

  async processWebhook(payload: any, signature: string): Promise<{ event: string; reference: string; status: string }> {
    const event = payload?.type || 'unknown';
    const session = payload?.data?.object || {};

    const statusMap: Record<string, string> = {
      'checkout.session.completed': 'paid',
      'payment_intent.succeeded': 'paid',
      'payment_intent.payment_failed': 'failed',
      'checkout.session.expired': 'expired',
    };

    return {
      event,
      reference: session.id || session.payment_intent || '',
      status: statusMap[event] || 'pending',
    };
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    const secretKey = this.getSecretKey();
    try {
      const params = new URLSearchParams();
      params.append('payment_intent', request.reference);
      if (request.amount) params.append('amount', Math.round(request.amount * 100).toString());
      if (request.reason) params.append('reason', request.reason);

      const res = await fetch(`${this.baseUrl}/refunds`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Stripe refund failed');

      return {
        success: true,
        refundRef: data.id,
        amount: data.amount / 100,
        status: data.status,
      };
    } catch (err: any) {
      this.logger.error(`Stripe refund error: ${err.message}`);
      return { success: false, amount: request.amount || 0, status: 'failed', message: err.message };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/balance`, {
        headers: { 'Authorization': `Bearer ${this.getSecretKey()}` },
      });

      return {
        status: res.ok ? 'ok' : 'error',
        message: res.ok ? 'Stripe API is reachable' : `Stripe returned ${res.status}`,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return { status: 'error', message: err.message, latencyMs: Date.now() - start };
    }
  }
}
