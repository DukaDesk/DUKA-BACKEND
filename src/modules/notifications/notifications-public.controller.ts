import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Notifications - Public (User-Facing)')
@Controller({ version: '1' })
export class NotificationsPublicController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── In-App (User-Facing) ────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('notifications')
  @ApiOperation({ summary: 'List current user notifications' })
  @ApiQuery({ name: 'unreadOnly', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@CurrentUser('id') userId: string, @Query() query: any) {
    return this.notificationsService.findAll(userId, query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Get current user unread notification count' })
  getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put('notifications/:id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('notifications/mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  // ─── Templates ───────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('notifications/templates')
  @ApiOperation({ summary: 'List templates (optional tenant filter)' })
  @ApiQuery({ name: 'tenantId', required: false })
  getTemplates(@Query('tenantId') tenantId?: string) {
    return this.notificationsService.getTemplates(tenantId);
  }

  // ─── Preferences ─────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('notifications/preferences')
  @ApiOperation({ summary: 'Get current user notification preferences' })
  @ApiQuery({ name: 'tenantId', required: false })
  getPreferences(@CurrentUser('id') userId: string, @Query('tenantId') tenantId?: string) {
    return this.notificationsService.getPreferences(userId, tenantId);
  }

  // ─── Device Tokens ───────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('notifications/devices')
  @ApiOperation({ summary: 'Register device for push notifications' })
  registerDevice(@CurrentUser('id') userId: string, @Body() data: { token: string; platform?: string; deviceId?: string }) {
    return this.notificationsService.registerDevice(userId, data);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('notifications/devices/:token')
  @ApiOperation({ summary: 'Unregister device' })
  unregisterDevice(@Param('token') token: string) {
    return this.notificationsService.unregisterDevice(token);
  }

  // ─── Analytics ───────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('notifications/analytics')
  @ApiOperation({ summary: 'Notification click analytics (optional tenant filter)' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  getClickAnalytics(
    @Query('userId') userId?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.notificationsService.getClickAnalytics(userId, tenantId);
  }
}