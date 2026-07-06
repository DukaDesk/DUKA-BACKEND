import { Injectable, Logger } from '@nestjs/common';
import { PaymentAdapter, PaymentRequest, PaymentResponse, VerifyResponse, RefundRequest, RefundResponse, HealthCheckResult } from './payment-adapter.interface';

@Injectable()
export class FlutterwaveAdapter implements PaymentAdapter {
  readonly provider = 'flutterwave';
  private readonly logger = new Logger(FlutterwaveAdapter.name);
  private readonly baseUrl = 'https://api.flutterwave.com/v3';

  async initializePayment(request: PaymentRequest): Promise<PaymentResponse> {
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_test_placeholder';
    try {
      const res = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_ref: request.reference,
          amount: request.amount,
          currency: request.currency,
          redirect_url: request.callbackUrl,
          customer: request.customer,
          meta: request.metadata,
        }),
      });
      const data: any = await res.json();
      if (data.status !== 'success') throw new Error(data.message || 'Flutterwave init failed');
      return {
        success: true,
        reference: request.reference,
        providerRef: data.data.id.toString(),
        authorizationUrl: data.data.link,
        status: 'pending',
      };
    } catch (err: any) {
      this.logger.error(`Flutterwave init error: ${err.message}`);
      return { success: false, reference: request.reference, providerRef: '', status: 'failed', message: err.message };
    }
  }

  async verifyPayment(reference: string): Promise<VerifyResponse> {
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_test_placeholder';
    const res = await fetch(`${this.baseUrl}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data: any = await res.json();
    if (data.status !== 'success') throw new Error(data.message || 'Verification failed');
    return {
      success: data.data.status === 'successful',
      status: data.data.status,
      amount: data.data.amount,
      fees: data.data.fee || 0,
      netAmount: data.data.amount - (data.data.fee || 0),
      customer: data.data.customer,
      providerData: data.data,
    };
  }

  async processWebhook(payload: any, signature: string): Promise<{ event: string; reference: string; status: string }> {
    const event = payload['event.type'] || payload.event || 'unknown';
    const reference = payload.data?.tx_ref || payload.data?.reference || '';
    const status = payload.data?.status || 'unknown';
    this.logger.log(`Flutterwave webhook: ${event} ref=${reference}`);
    return { event, reference, status };
  }

  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_test_placeholder';
    try {
      const res = await fetch(`${this.baseUrl}/transactions/${request.reference}/refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: request.amount,
          reason: request.reason,
          meta: request.metadata,
        }),
      });
      const data: any = await res.json();
      if (data.status !== 'success') throw new Error(data.message || 'Refund failed');
      return {
        success: true,
        refundRef: data.data?.id?.toString(),
        amount: data.data?.amount || request.amount || 0,
        status: data.data?.status || 'pending',
      };
    } catch (err: any) {
      this.logger.error(`Flutterwave refund error: ${err.message}`);
      return { success: false, amount: request.amount || 0, status: 'failed', message: err.message };
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_test_placeholder';
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/banks/NG`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      const data: any = await res.json();
      return {
        status: data.status === 'success' ? 'ok' : 'error',
        message: data.status === 'success' ? 'Flutterwave API reachable' : data.message || 'Health check failed',
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return { status: 'error', message: err.message, latencyMs: Date.now() - start };
    }
  }
}
