import { Injectable } from '@nestjs/common';
import { AiProviderInterface, AiProviderConfig } from '../ai-provider.interface';

@Injectable()
export class MockAIProvider implements AiProviderInterface {
  readonly name = 'Mock AI';
  readonly provider = 'mock';
  readonly models = ['mock-model'];

  constructor(_config?: AiProviderConfig) {}

  async complete(input: string, _options?: any) {
    await new Promise((r) => setTimeout(r, 50));
    const tokens = input.split(/\s+/).length * 2;
    return {
      output: `[Mock] Echo: ${input.substring(0, 100)}...`,
      inputTokens: tokens,
      outputTokens: tokens,
      totalTokens: tokens * 2,
      cost: 0,
      durationMs: 50,
    };
  }

  async embed(input: string, _options?: any) {
    await new Promise((r) => setTimeout(r, 30));
    const dims = 384;
    const vector = Array.from({ length: dims }, () => Math.random() - 0.5);
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    return {
      vector: vector.map((v) => v / norm),
      dimensions: dims,
      totalTokens: input.split(/\s+/).length,
      cost: 0,
    };
  }
}
