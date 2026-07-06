import { Injectable, Logger } from '@nestjs/common';
import { AiProviderInterface, AiProviderConfig } from '../ai-provider.interface';

@Injectable()
export class AnthropicProvider implements AiProviderInterface {
  readonly name = 'Anthropic';
  readonly provider = 'anthropic';
  readonly models = ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
  private readonly logger = new Logger(AnthropicProvider.name);

  private apiKey: string;
  private baseUrl: string;

  constructor(config?: AiProviderConfig) {
    this.apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.baseUrl = config?.baseUrl || 'https://api.anthropic.com/v1';
  }

  async complete(input: string, options?: {
    model?: string; systemPrompt?: string; temperature?: number; maxTokens?: number;
  }) {
    const startTime = Date.now();
    const model = options?.model || 'claude-3-5-sonnet-20240620';

    const body: any = {
      model,
      messages: [{ role: 'user', content: input }],
      max_tokens: options?.maxTokens || 2048,
      temperature: options?.temperature ?? 0.7,
    };

    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };

    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as any;
      const durationMs = Date.now() - startTime;
      const output = data.content?.[0]?.text || '';
      const usage = data.usage || { input_tokens: 0, output_tokens: 0 };

      return {
        output,
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        cost: this.calculateCost(model, usage.input_tokens || 0, usage.output_tokens || 0),
        durationMs,
      };
    } catch (err: any) {
      this.logger.error(`Anthropic completion failed: ${err.message}`);
      throw err;
    }
  }

  async embed(_input: string, _options?: { model?: string }): Promise<{ vector: number[]; dimensions: number; totalTokens: number; cost: number }> {
    throw new Error('Anthropic does not support embeddings directly. Use OpenAI or another provider for embeddings.');
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const rates: Record<string, [number, number]> = {
      'claude-3-5-sonnet-20240620': [3, 15],
      'claude-3-opus-20240229': [15, 75],
      'claude-3-haiku-20240307': [0.25, 1.25],
    };
    const [inputRate, outputRate] = rates[model] || [3, 15];
    return ((inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate) / 100;
  }
}
