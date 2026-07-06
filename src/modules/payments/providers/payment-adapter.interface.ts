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

export interface RefundRequest {
  reference: string;
  amount?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface RefundResponse {
  success: boolean;
  refundRef?: string;
  amount: number;
  status: string;
  message?: string;
}

export interface HealthCheckResult {
  status: 'ok' | 'error';
  message: string;
  latencyMs?: number;
}

export interface PaymentAdapter {
  readonly provider: string;
  initializePayment(request: PaymentRequest): Promise<PaymentResponse>;
  verifyPayment(reference: string): Promise<VerifyResponse>;
  processWebhook(payload: any, signature: string): Promise<{ event: string; reference: string; status: string }>;
  refundPayment(request: RefundRequest): Promise<RefundResponse>;
  healthCheck(): Promise<HealthCheckResult>;
}
