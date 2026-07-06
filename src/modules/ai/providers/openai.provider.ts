import { Injectable, Logger } from '@nestjs/common';
import { AiProviderInterface, AiProviderConfig } from '../ai-provider.interface';

@Injectable()
export class OpenAIProvider implements AiProviderInterface {
  readonly name = 'OpenAI';
  readonly provider = 'openai';
  readonly models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'text-embedding-3-small', 'text-embedding-3-large'];
  private readonly logger = new Logger(OpenAIProvider.name);

  private apiKey: string;
  private baseUrl: string;

  constructor(config: AiProviderConfig) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  async complete(input: string, options?: {
    model?: string; systemPrompt?: string; temperature?: number; maxTokens?: number;
  }) {
    const startTime = Date.now();
    const model = options?.model || 'gpt-4o-mini';

    const body: any = {
      model,
      messages: [
        ...(options?.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: input },
      ],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as any;
      const durationMs = Date.now() - startTime;
      const choice = data.choices?.[0];
      const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      return {
        output: choice?.message?.content || '',
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        cost: this.calculateCost(model, usage.prompt_tokens || 0, usage.completion_tokens || 0),
        durationMs,
      };
    } catch (err: any) {
      this.logger.error(`OpenAI completion failed: ${err.message}`);
      throw err;
    }
  }

  async embed(input: string, options?: { model?: string }) {
    const startTime = Date.now();
    const model = options?.model || 'text-embedding-3-small';

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, input }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Embedding error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as any;
      const durationMs = Date.now() - startTime;
      const usage = data.usage || { total_tokens: 0 };
      const vector = data.data?.[0]?.embedding || [];

      return {
        vector,
        dimensions: vector.length,
        totalTokens: usage.total_tokens || 0,
        cost: this.calculateCost(model, usage.total_tokens || 0, 0),
      };
    } catch (err: any) {
      this.logger.error(`OpenAI embedding failed: ${err.message}`);
      throw err;
    }
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const rates: Record<string, [number, number]> = {
      'gpt-4o': [2.5, 10],
      'gpt-4o-mini': [0.15, 0.6],
      'gpt-4-turbo': [10, 30],
      'gpt-3.5-turbo': [0.5, 1.5],
      'text-embedding-3-small': [0.02, 0],
      'text-embedding-3-large': [0.13, 0],
    };
    const [inputRate, outputRate] = rates[model] || [1, 2];
    return ((inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate) / 100;
  }
}
