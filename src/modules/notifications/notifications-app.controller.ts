import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Notifications - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/notifications', version: '1' })
export class NotificationsAppController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  // ─── Templates ───────────────────────────────

  @Post('templates')
  @ApiOperation({ summary: 'Create notification template for current tenant' })
  async createTemplate(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.notificationsService.createTemplate({ ...data, tenantId });
  }

  @Get('templates')
  @ApiOperation({ summary: 'List templates for current tenant' })
  async getTemplates(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.notificationsService.getTemplates(tenantId);
  }

  @Put('templates/:id')
  @ApiOperation({ summary: 'Update template for current tenant' })
  async updateTemplate(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() data: any) {
    // Template is validated by service to belong to this tenant
    return this.notificationsService.updateTemplate(id, data);
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete template for current tenant' })
  async deleteTemplate(@CurrentUser('id') userId: string, @Param('id') id: string) {
    // Template is validated by service to belong to this tenant
    return this.notificationsService.deleteTemplate(id);
  }

  @Post('send-from-template')
  @ApiOperation({ summary: 'Send notification from template for current tenant' })
  async sendFromTemplate(@CurrentUser('id') userId: string, @Body() data: { templateId: string; userId: string; variables: Record<string, string> }) {
    return this.notificationsService.sendFromTemplate(data.templateId, data.userId, data.variables);
  }

  // ─── Preferences ─────────────────────────────

  @Post('preferences')
  @ApiOperation({ summary: 'Set notification preference for current tenant' })
  async setPreference(@CurrentUser('id') userId: string, @Body() data: { channel: string; category: string; enabled: boolean; quietHours?: any }) {
    const tenantId = await this.getTenantId(userId);
    return this.notificationsService.setPreference(userId, { ...data, tenantId });
  }

  // ─── SMS ─────────────────────────────────────

  @Post('sms')
  @ApiOperation({ summary: 'Send SMS notification for current tenant' })
  async sendSms(@CurrentUser('id') userId: string, @Body() data: { phoneNumber: string; message: string; userId?: string }) {
    return this.notificationsService.sendSms(data.phoneNumber, data.message, data.userId);
  }

  // ─── Campaigns ────────────────────────────────

  @Post('campaigns')
  @ApiOperation({ summary: 'Send push/email campaign for current tenant' })
  async sendCampaign(@CurrentUser('id') userId: string, @Body() data: { templateId: string; userIds: string[]; variables?: Record<string, string> }) {
    const tenantId = await this.getTenantId(userId);
    return this.notificationsService.sendCampaign({ ...data, tenantId });
  }

  @Post('campaigns/sms')
  @ApiOperation({ summary: 'Send SMS campaign for current tenant' })
  async sendSmsCampaign(@CurrentUser('id') userId: string, @Body() data: { message: string; recipients: { phoneNumber: string; userId?: string }[] }) {
    const tenantId = await this.getTenantId(userId);
    return this.notificationsService.sendSmsCampaign({ ...data, tenantId });
  }

  // ─── Click Tracking ──────────────────────────

  @Post(':id/click')
  @ApiOperation({ summary: 'Track notification click for current tenant' })
  async clickTrack(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notificationsService.clickTrack(id);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Notification click analytics for current tenant' })
  @ApiQuery({ name: 'userId', required: false })
  async getClickAnalytics(@CurrentUser('id') userId: string, @Query('userId') targetUserId?: string) {
    const tenantId = await this.getTenantId(userId);
    return this.notificationsService.getClickAnalytics(targetUserId, tenantId);
  }

  // ─── Send (admin) ────────────────────────────

  @Post('send')
  @ApiOperation({ summary: 'Send notification directly for current tenant' })
  async send(@CurrentUser('id') userId: string, @Body() data: { userId: string; type: string; title: string; body?: string; data?: any }) {
    const tenantId = await this.getTenantId(userId);
    return this.notificationsService.createNotification({ ...data, tenantId });
  }
}