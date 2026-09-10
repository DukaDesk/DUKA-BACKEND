import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Booking - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/booking', version: '1' })
export class BookingAppController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  // ─── Services ────────────────────────────────

  @Post('services')
  @ApiOperation({ summary: 'Create booking service' })
  async createService(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.createService(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('services/:id')
  @ApiOperation({ summary: 'Update booking service' })
  updateService(@Param('id') id: string, @Body() data: any) {
    return this.bookingService.updateService(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('services/:id')
  @ApiOperation({ summary: 'Delete booking service' })
  deleteService(@Param('id') id: string) {
    return this.bookingService.deleteService(id);
  }

  // ─── Locations ────────────────────────────────

  @Post('locations')
  @ApiOperation({ summary: 'Create booking location' })
  async createLocation(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.createLocation(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('locations/:id')
  @ApiOperation({ summary: 'Update booking location' })
  updateLocation(@Param('id') id: string, @Body() data: any) {
    return this.bookingService.updateLocation(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('locations/:id')
  @ApiOperation({ summary: 'Delete booking location' })
  deleteLocation(@Param('id') id: string) {
    return this.bookingService.deleteLocation(id);
  }

  // ─── Cancellation Policies ────────────────────

  @Post('cancellation-policies')
  @ApiOperation({ summary: 'Create cancellation policy with refund tiers' })
  async createCancellationPolicy(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.createCancellationPolicy(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('cancellation-policies')
  @ApiOperation({ summary: 'List cancellation policies' })
  async getCancellationPolicies(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.getCancellationPolicies(tenantId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('bookings/:id/cancellation-refund')
  @ApiOperation({ summary: 'Calculate refund amount if cancelled now' })
  calculateCancellationRefund(@Param('id') id: string) {
    return this.bookingService.calculateCancellationRefund(id);
  }

  // ─── Reminders ────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('bookings/:id/reminders')
  @ApiOperation({ summary: 'Schedule reminders for a booking' })
  scheduleReminders(@Param('id') id: string, @Body() data: { minutesBefore: number[] }) {
    return this.bookingService.scheduleReminders(id, data.minutesBefore);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('reminders/process')
  @ApiOperation({ summary: 'Process pending reminders and send due ones' })
  processReminders() {
    return this.bookingService.processReminders();
  }

  // ─── Staff ────────────────────────────────────

  @Post('staff')
  @ApiOperation({ summary: 'Create staff member with service assignments' })
  async createStaff(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.createStaff(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('staff/:id')
  @ApiOperation({ summary: 'Update staff member' })
  updateStaff(@Param('id') id: string, @Body() data: any) {
    return this.bookingService.updateStaff(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('staff/:id')
  @ApiOperation({ summary: 'Delete staff member' })
  deleteStaff(@Param('id') id: string) {
    return this.bookingService.deleteStaff(id);
  }

  // ─── Resources ────────────────────────────────

  @Post('resources')
  @ApiOperation({ summary: 'Create booking resource' })
  async createResource(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.createResource(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('resources/:id')
  @ApiOperation({ summary: 'Update resource' })
  updateResource(@Param('id') id: string, @Body() data: any) {
    return this.bookingService.updateResource(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('resources/:id')
  @ApiOperation({ summary: 'Delete resource' })
  deleteResource(@Param('id') id: string) {
    return this.bookingService.deleteResource(id);
  }

  // ─── Schedules ────────────────────────────────

  @Post('schedules')
  @ApiOperation({ summary: 'Create schedule' })
  async createSchedule(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.createSchedule(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('schedules/:id')
  @ApiOperation({ summary: 'Update schedule' })
  updateSchedule(@Param('id') id: string, @Body() data: any) {
    return this.bookingService.updateSchedule(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('schedules/:id')
  @ApiOperation({ summary: 'Delete schedule' })
  deleteSchedule(@Param('id') id: string) {
    return this.bookingService.deleteSchedule(id);
  }

  // ─── Bookings (Tenant Management) ─────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('bookings')
  @ApiOperation({ summary: 'List bookings (tenant)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'serviceId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getBookings(@CurrentUser('id') userId: string, @Query() query: any) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.getBookings(tenantId, query);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get booking detail with history' })
  getBooking(@Param('id') id: string) {
    return this.bookingService.getBooking(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('bookings/:id/status')
  @ApiOperation({ summary: 'Update booking status with transition validation' })
  updateBookingStatus(@Param('id') id: string, @Body() data: { status: string; reason?: string }) {
    return this.bookingService.updateBookingStatus(id, data.status, data.reason);
  }

  // ─── Waiting List ────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('waiting-list')
  @ApiOperation({ summary: 'Get waiting list' })
  @ApiQuery({ name: 'serviceId', required: false })
  async getWaitingList(@CurrentUser('id') userId: string, @Query('serviceId') serviceId?: string) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.getWaitingList(tenantId, serviceId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('waiting-list/:id/notify')
  @ApiOperation({ summary: 'Mark waiting list entry as notified' })
  markNotified(@Param('id') id: string) {
    return this.bookingService.markNotified(id);
  }

  // ─── Calendar / Timeline ─────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('calendar')
  @ApiOperation({ summary: 'Get booking timeline for a date range' })
  @ApiQuery({ name: 'from', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: true, description: 'YYYY-MM-DD' })
  async getCalendar(@CurrentUser('id') userId: string, @Query('from') from: string, @Query('to') to: string) {
    const tenantId = await this.getTenantId(userId);
    return this.bookingService.getBookings(tenantId, {
      date: from,
      limit: '100',
    });
  }
}