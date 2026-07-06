export interface AiProviderInterface {
  name: string;
  provider: string;
  models: string[];

  complete(input: string, options?: {
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    output: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    durationMs: number;
  }>;

  embed(input: string, options?: {
    model?: string;
  }): Promise<{
    vector: number[];
    dimensions: number;
    totalTokens: number;
    cost: number;
  }>;
}

export interface AiProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  [key: string]: any;
}
