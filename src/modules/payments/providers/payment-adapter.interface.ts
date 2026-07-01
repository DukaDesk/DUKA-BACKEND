export interface PaymentRequest {
  amount: number;
  currency: string;
  customer: { email: string; name?: string; phone?: string };
  reference: string;
  metadata?: Record<string, any>;
  callbackUrl?: string;
}

export interface PaymentResponse {
  success: boolean;
  reference: string;
  providerRef: string;
  authorizationUrl?: string;
  status: string;
  message?: string;
}

export interface VerifyResponse {
  success: boolean;
  status: string;
  amount: number;
  fees: number;
  netAmount: number;
  customer: any;
  providerData: any;
}

export interface PaymentAdapter {
  readonly provider: string;
  initializePayment(request: PaymentRequest): Promise<PaymentResponse>;
  verifyPayment(reference: string): Promise<VerifyResponse>;
  processWebhook(payload: any, signature: string): Promise<{ event: string; reference: string; status: string }>;
}
