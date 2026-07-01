import { Injectable, Logger } from '@nestjs/common';
import { PaymentAdapter, PaymentRequest, PaymentResponse, VerifyResponse } from './payment-adapter.interface';

@Injectable()
export class PaystackAdapter implements PaymentAdapter {
  readonly provider = 'paystack';
  private readonly logger = new Logger(PaystackAdapter.name);
  private readonly baseUrl = 'https://api.paystack.co';

  async initializePayment(request: PaymentRequest): Promise<PaymentResponse> {
    const secretKey = process.env.PAYSTACK_SECRET_KEY || 'sk_test_placeholder';
    try {
      const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: request.customer.email,
          amount: Math.round(request.amount * 100),
          currency: request.currency,
          reference: request.reference,
          callback_url: request.callbackUrl,
          metadata: request.metadata,
        }),
      });
      const data: any = await res.json();
      if (!data.status) throw new Error(data.message || 'Paystack init failed');
      return {
        success: true,
        reference: request.reference,
        providerRef: data.data.reference,
        authorizationUrl: data.data.authorization_url,
        status: 'pending',
      };
    } catch (err: any) {
      this.logger.error(`Paystack init error: ${err.message}`);
      return { success: false, reference: request.reference, providerRef: '', status: 'failed', message: err.message };
    }
  }

  async verifyPayment(reference: string): Promise<VerifyResponse> {
    const secretKey = process.env.PAYSTACK_SECRET_KEY || 'sk_test_placeholder';
    const res = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data: any = await res.json();
    if (!data.status) throw new Error(data.message || 'Verification failed');
    return {
      success: data.data.status === 'success',
      status: data.data.status,
      amount: data.data.amount / 100,
      fees: (data.data.fees || 0) / 100,
      netAmount: (data.data.amount - (data.data.fees || 0)) / 100,
      customer: data.data.customer,
      providerData: data.data,
    };
  }

  async processWebhook(payload: any, signature: string): Promise<{ event: string; reference: string; status: string }> {
    const event = payload.event;
    const reference = payload.data?.reference || '';
    const status = payload.data?.status || 'unknown';
    this.logger.log(`Paystack webhook: ${event} ref=${reference}`);
    return { event, reference, status };
  }
}
