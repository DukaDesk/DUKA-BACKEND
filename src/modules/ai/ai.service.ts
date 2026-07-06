import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AiProviderInterface } from './ai-provider.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { MockAIProvider } from './providers/mock.provider';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private providers = new Map<string, AiProviderInterface>();

  constructor(private prisma: PrismaService) {
    const openai = new OpenAIProvider({});
    this.providers.set('openai', openai);
    this.providers.set('anthropic', new AnthropicProvider());
    this.providers.set('mock', new MockAIProvider());
  }

  getAvailableProviders(): { name: string; provider: string; models: string[] }[] {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      provider: p.provider,
      models: p.models,
    }));
  }

  getProvider(provider: string): AiProviderInterface {
    const instance = this.providers.get(provider);
    if (!instance) throw new BadRequestException(`Unknown AI provider: ${provider}`);
    return instance;
  }

  registerProvider(provider: string, instance: AiProviderInterface) {
    this.providers.set(provider, instance);
    this.logger.log(`Registered AI provider: ${provider}`);
  }

  async complete(data: {
    tenantId?: string;
    userId?: string;
    provider?: string;
    model?: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    const providerName = data.provider || 'openai';
    const instance = this.getProvider(providerName);

    const startTime = Date.now();

    try {
      const result = await instance.complete(data.prompt, {
        model: data.model,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
      });

      await this.prisma.aICompletion.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          provider: providerName,
          model: data.model || instance.models[0],
          input: data.prompt,
          output: result.output,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          cost: result.cost,
          durationMs: result.durationMs,
          status: 'completed',
        } as any,
      });

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;

      await this.prisma.aICompletion.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          provider: providerName,
          model: data.model || instance.models[0],
          input: data.prompt,
          status: 'failed',
          error: err.message,
          durationMs,
        } as any,
      });

      throw err;
    }
  }

  async embed(data: {
    tenantId?: string;
    content: string;
    entityType?: string;
    entityId?: string;
    provider?: string;
    model?: string;
  }) {
    const providerName = data.provider || 'openai';
    const instance = this.getProvider(providerName);

    const result = await instance.embed(data.content, { model: data.model });

    if (data.entityType && data.entityId) {
      await this.prisma.aIEmbedding.upsert({
        where: { entityType_entityId: {
          entityType: data.entityType,
          entityId: data.entityId,
        }},
        create: {
          tenantId: data.tenantId,
          entityType: data.entityType,
          entityId: data.entityId,
          provider: providerName,
          model: data.model || instance.models[0],
          vector: result.vector,
          dimensions: result.dimensions,
          content: data.content,
        } as any,
        update: {
          vector: result.vector,
          dimensions: result.dimensions,
          content: data.content,
        } as any,
      });
    }

    return result;
  }

  // ─── Prompt Templates ────────────────────────────────────────

  async createPrompt(data: {
    tenantId?: string; name: string; slug: string;
    prompt: string; variables?: string[]; model?: string; config?: Record<string, any>;
  }) {
    return this.prisma.aIPrompt.create({ data: data as any });
  }

  async getPrompts(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.prisma.aIPrompt.findMany({ where, orderBy: { name: 'asc' } });
  }

  async getPrompt(tenantId: string | undefined, slug: string) {
    const where: any = { slug };
    if (tenantId) where.tenantId = tenantId;
    const prompt = await this.prisma.aIPrompt.findFirst({ where });
    if (!prompt) throw new BadRequestException('Prompt not found');
    return prompt;
  }

  async renderPrompt(slug: string, variables: Record<string, string>, tenantId?: string) {
    const prompt = await this.getPrompt(tenantId, slug);
    let rendered = prompt.prompt;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value);
    }
    return { prompt: prompt, rendered };
  }

  async updatePrompt(id: string, data: Partial<{
    name: string; prompt: string; variables: string[]; model: string; config: Record<string, any>; isActive: boolean;
  }>) {
    return this.prisma.aIPrompt.update({
      where: { id },
      data: { ...data, version: { increment: 1 } } as any,
    });
  }

  async deletePrompt(id: string) {
    return this.prisma.aIPrompt.delete({ where: { id } });
  }

  // ─── Provider Management ─────────────────────────────────────

  async saveProviderConfig(tenantId: string | undefined, data: {
    name: string; provider: string; apiKeyEnc?: string;
    baseUrl?: string; models?: string[]; config?: Record<string, any>;
  }) {
    return this.prisma.aIProvider.create({ data: { tenantId, ...data } as any });
  }

  async getProviderConfigs(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.prisma.aIProvider.findMany({ where, orderBy: { name: 'asc' } });
  }

  async getCompletions(tenantId?: string, userId?: string, page = 1, limit = 50) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (userId) where.userId = userId;

    const [data, total] = await Promise.all([
      this.prisma.aICompletion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.aICompletion.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUsageStats(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;

    const completions = await this.prisma.aICompletion.findMany({ where });
    const totalTokens = completions.reduce((s, c) => s + c.totalTokens, 0);
    const totalCost = completions.reduce((s, c) => s + Number(c.cost), 0);
    const totalCompletions = completions.length;
    const failedCompletions = completions.filter((c) => c.status === 'failed').length;

    return {
      totalCompletions,
      failedCompletions,
      totalTokens,
      totalCost,
      avgTokensPerRequest: totalCompletions > 0 ? Math.round(totalTokens / totalCompletions) : 0,
    };
  }
}
