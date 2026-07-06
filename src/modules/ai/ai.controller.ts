import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('AI Platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('ai/providers')
  @ApiOperation({ summary: 'List available AI providers' })
  getAvailableProviders() {
    return this.aiService.getAvailableProviders();
  }

  @Post('ai/complete')
  @ApiOperation({ summary: 'Generate completion' })
  complete(@Body() data: {
    tenantId?: string; userId?: string;
    provider?: string; model?: string; prompt: string;
    systemPrompt?: string; temperature?: number; maxTokens?: number;
  }) {
    return this.aiService.complete(data);
  }

  @Post('ai/embed')
  @ApiOperation({ summary: 'Generate embedding' })
  embed(@Body() data: {
    tenantId?: string; content: string;
    entityType?: string; entityId?: string; provider?: string; model?: string;
  }) {
    return this.aiService.embed(data);
  }

  // ─── Prompt Templates ────────────────────────────────────────

  @Post('ai/prompts')
  @ApiOperation({ summary: 'Create prompt template' })
  createPrompt(@Body() data: {
    tenantId?: string; name: string; slug: string;
    prompt: string; variables?: string[]; model?: string; config?: Record<string, any>;
  }) {
    return this.aiService.createPrompt(data);
  }

  @Get('ai/prompts')
  @ApiOperation({ summary: 'List prompt templates' })
  @ApiQuery({ name: 'tenantId', required: false })
  getPrompts(@Query('tenantId') tenantId?: string) {
    return this.aiService.getPrompts(tenantId);
  }

  @Get('ai/prompts/:slug')
  @ApiOperation({ summary: 'Get prompt by slug' })
  @ApiQuery({ name: 'tenantId', required: false })
  getPrompt(@Query('tenantId') tenantId: string | undefined, @Param('slug') slug: string) {
    return this.aiService.getPrompt(tenantId, slug);
  }

  @Post('ai/prompts/:slug/render')
  @ApiOperation({ summary: 'Render prompt with variables' })
  renderPrompt(
    @Param('slug') slug: string,
    @Body() data: { variables: Record<string, string>; tenantId?: string },
  ) {
    return this.aiService.renderPrompt(slug, data.variables, data.tenantId);
  }

  @Put('ai/prompts/:id')
  @ApiOperation({ summary: 'Update prompt template' })
  updatePrompt(@Param('id') id: string, @Body() data: any) {
    return this.aiService.updatePrompt(id, data);
  }

  @Delete('ai/prompts/:id')
  @ApiOperation({ summary: 'Delete prompt template' })
  deletePrompt(@Param('id') id: string) {
    return this.aiService.deletePrompt(id);
  }

  // ─── Provider Config ─────────────────────────────────────────

  @Post('ai/providers/config')
  @ApiOperation({ summary: 'Save provider configuration' })
  saveProviderConfig(@Body() data: {
    tenantId?: string; name: string; provider: string;
    apiKeyEnc?: string; baseUrl?: string; models?: string[]; config?: Record<string, any>;
  }) {
    return this.aiService.saveProviderConfig(data.tenantId, data);
  }

  @Get('ai/providers/config')
  @ApiOperation({ summary: 'Get provider configurations' })
  @ApiQuery({ name: 'tenantId', required: false })
  getProviderConfigs(@Query('tenantId') tenantId?: string) {
    return this.aiService.getProviderConfigs(tenantId);
  }

  // ─── Usage & History ─────────────────────────────────────────

  @Get('ai/completions')
  @ApiOperation({ summary: 'Get completion history' })
  @ApiQuery({ name: 'tenantId', required: false })
  getCompletions(
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.aiService.getCompletions(
      tenantId, userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('ai/usage')
  @ApiOperation({ summary: 'Get AI usage statistics' })
  @ApiQuery({ name: 'tenantId', required: false })
  getUsageStats(@Query('tenantId') tenantId?: string) {
    return this.aiService.getUsageStats(tenantId);
  }
}
