export interface ConnectorConfig {
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  webhookUrl?: string;
  scopes?: string[];
  [key: string]: any;
}

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errors?: string[];
  summary?: string;
}

export interface IntegrationConnectorInterface {
  readonly provider: string;
  readonly label: string;
  readonly description: string;
  readonly oauthRequired: boolean;
  connect(config: ConnectorConfig): Promise<{ success: boolean; message: string }>;
  disconnect(): Promise<void>;
  testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }>;
  sync(type?: string): Promise<SyncResult>;
  getWebhookEvents(): string[];
}
