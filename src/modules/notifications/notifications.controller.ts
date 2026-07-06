import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Notifications')
@Controller({ version: '1' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── In-App ──────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('notifications')
  @ApiOperation({ summary: 'List user notifications' })
  @ApiQuery({ name: 'unreadOnly', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@CurrentUser('id') userId: string, @Query() query: any) {
    return this.notificationsService.findAll(userId, query);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('notifications/:id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  // ─── Templates ───────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/templates')
  @ApiOperation({ summary: 'Create notification template' })
  createTemplate(@Body() data: any) {
    return this.notificationsService.createTemplate(data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('notifications/templates')
  @ApiOperation({ summary: 'List templates' })
  @ApiQuery({ name: 'tenantId', required: false })
  getTemplates(@Query('tenantId') tenantId?: string) {
    return this.notificationsService.getTemplates(tenantId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('notifications/templates/:id')
  @ApiOperation({ summary: 'Update template' })
  updateTemplate(@Param('id') id: string, @Body() data: any) {
    return this.notificationsService.updateTemplate(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('notifications/templates/:id')
  @ApiOperation({ summary: 'Delete template' })
  deleteTemplate(@Param('id') id: string) {
    return this.notificationsService.deleteTemplate(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/send-from-template')
  @ApiOperation({ summary: 'Send notification from template' })
  sendFromTemplate(@Body() data: { templateId: string; userId: string; variables: Record<string, string> }) {
    return this.notificationsService.sendFromTemplate(data.templateId, data.userId, data.variables);
  }

  // ─── Preferences ─────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('notifications/preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  @ApiQuery({ name: 'tenantId', required: false })
  getPreferences(@CurrentUser('id') userId: string, @Query('tenantId') tenantId?: string) {
    return this.notificationsService.getPreferences(userId, tenantId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/preferences')
  @ApiOperation({ summary: 'Set notification preference' })
  setPreference(@CurrentUser('id') userId: string, @Body() data: { channel: string; category: string; enabled: boolean; tenantId?: string; quietHours?: any }) {
    return this.notificationsService.setPreference(userId, data);
  }

  // ─── Device Tokens ───────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/devices')
  @ApiOperation({ summary: 'Register device for push notifications' })
  registerDevice(@CurrentUser('id') userId: string, @Body() data: { token: string; platform?: string; deviceId?: string }) {
    return this.notificationsService.registerDevice(userId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('notifications/devices/:token')
  @ApiOperation({ summary: 'Unregister device' })
  unregisterDevice(@Param('token') token: string) {
    return this.notificationsService.unregisterDevice(token);
  }

  // ─── SMS ─────────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/sms')
  @ApiOperation({ summary: 'Send SMS notification' })
  sendSms(@Body() data: { phoneNumber: string; message: string; userId?: string }) {
    return this.notificationsService.sendSms(data.phoneNumber, data.message, data.userId);
  }

  // ─── Campaigns ────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/campaigns')
  @ApiOperation({ summary: 'Send push/email campaign to multiple users' })
  sendCampaign(@Body() data: { tenantId?: string; templateId: string; userIds: string[]; variables?: Record<string, string> }) {
    return this.notificationsService.sendCampaign(data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/campaigns/sms')
  @ApiOperation({ summary: 'Send SMS campaign to multiple recipients' })
  sendSmsCampaign(@Body() data: { tenantId?: string; message: string; recipients: { phoneNumber: string; userId?: string }[] }) {
    return this.notificationsService.sendSmsCampaign(data);
  }

  // ─── Click Tracking ──────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/:id/click')
  @ApiOperation({ summary: 'Track notification click' })
  clickTrack(@Param('id') id: string) {
    return this.notificationsService.clickTrack(id);
  }

  // ─── Send (admin) ────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('notifications/send')
  @ApiOperation({ summary: 'Send notification directly' })
  send(@Body() data: { userId: string; type: string; title: string; body?: string; data?: any }) {
    return this.notificationsService.createNotification(data);
  }
}
