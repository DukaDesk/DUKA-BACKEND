import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Booking')
@Controller({ version: '1' })
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ─── Services ────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('tenants/:tenantId/booking/services')
  @ApiOperation({ summary: 'Create booking service' })
  createService(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.bookingService.createService(tenantId, data);
  }

  @Public()
  @Get('tenants/:tenantId/booking/services')
  @ApiOperation({ summary: 'List booking services' })
  getServices(@Param('tenantId') tenantId: string) {
    return this.bookingService.getServices(tenantId);
  }

  @Public()
  @Get('booking/services/:id')
  @ApiOperation({ summary: 'Get booking service with assigned staff' })
  getService(@Param('id') id: string) {
    return this.bookingService.getService(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('booking/services/:id')
  @ApiOperation({ summary: 'Update booking service' })
  updateService(@Param('id') id: string, @Body() data: any) {
    return this.bookingService.updateService(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('booking/services/:id')
  @ApiOperation({ summary: 'Delete booking service' })
  deleteService(@Param('id') id: string) {
    return this.bookingService.deleteService(id);
  }

  // ─── Staff ───────────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('tenants/:tenantId/booking/staff')
  @ApiOperation({ summary: 'Create staff member with service assignments' })
  createStaff(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.bookingService.createStaff(tenantId, data);
  }

  @Public()
  @Get('tenants/:tenantId/booking/staff')
  @ApiOperation({ summary: 'List staff members' })
  getStaff(@Param('tenantId') tenantId: string) {
    return this.bookingService.getStaff(tenantId);
  }

  @Public()
  @Get('booking/staff/:id')
  @ApiOperation({ summary: 'Get staff member' })
  getStaffMember(@Param('id') id: string) {
    return this.bookingService.getStaffMember(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('booking/staff/:id')
  @ApiOperation({ summary: 'Update staff member' })
  updateStaff(@Param('id') id: string, @Body() data: any) {
    return this.bookingService.updateStaff(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('booking/staff/:id')
  @ApiOperation({ summary: 'Delete staff member' })
  deleteStaff(@Param('id') id: string) {
    return this.bookingService.deleteStaff(id);
  }

  // ─── Resources ───────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('tenants/:tenantId/booking/resources')
  @ApiOperation({ summary: 'Create booking resource' })
  createResource(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.bookingService.createResource(tenantId, data);
  }

  @Public()
  @Get('tenants/:tenantId/booking/resources')
  @ApiOperation({ summary: 'List resources' })
  getResources(@Param('tenantId') tenantId: string) {
    return this.bookingService.getResources(tenantId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('booking/resources/:id')
  @ApiOperation({ summary: 'Update resource' })
  updateResource(@Param('id') id: string, @Body() data: any) {
    return this.bookingService.updateResource(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('booking/resources/:id')
  @ApiOperation({ summary: 'Delete resource' })
  deleteResource(@Param('id') id: string) {
    return this.bookingService.deleteResource(id);
  }

  // ─── Schedules ───────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('tenants/:tenantId/booking/schedules')
  @ApiOperation({ summary: 'Create schedule' })
  createSchedule(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.bookingService.createSchedule(tenantId, data);
  }

  @Public()
  @Get('tenants/:tenantId/booking/schedules')
  @ApiOperation({ summary: 'List schedules' })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'resourceId', required: false })
  getSchedules(
    @Param('tenantId') tenantId: string,
    @Query('staffId') staffId?: string,
    @Query('resourceId') resourceId?: string,
  ) {
    return this.bookingService.getSchedules(tenantId, staffId, resourceId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('booking/schedules/:id')
  @ApiOperation({ summary: 'Update schedule' })
  updateSchedule(@Param('id') id: string, @Body() data: any) {
    return this.bookingService.updateSchedule(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('booking/schedules/:id')
  @ApiOperation({ summary: 'Delete schedule' })
  deleteSchedule(@Param('id') id: string) {
    return this.bookingService.deleteSchedule(id);
  }

  // ─── Availability ────────────────────────────

  @Public()
  @Get('tenants/:tenantId/booking/availability')
  @ApiOperation({ summary: 'Get available time slots' })
  @ApiQuery({ name: 'serviceId', required: true })
  @ApiQuery({ name: 'date', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'staffId', required: false })
  getAvailableSlots(
    @Param('tenantId') tenantId: string,
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.bookingService.getAvailableSlots(tenantId, serviceId, date, staffId);
  }

  // ─── Bookings ────────────────────────────────

  @Post('tenants/:tenantId/booking')
  @ApiOperation({ summary: 'Create booking (public)' })
  createBooking(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.bookingService.createBooking(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tenants/:tenantId/booking')
  @ApiOperation({ summary: 'List bookings' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'serviceId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getBookings(@Param('tenantId') tenantId: string, @Query() query: any) {
    return this.bookingService.getBookings(tenantId, query);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('booking/:id')
  @ApiOperation({ summary: 'Get booking detail with history' })
  getBooking(@Param('id') id: string) {
    return this.bookingService.getBooking(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('booking/:id/status')
  @ApiOperation({ summary: 'Update booking status with transition validation' })
  updateBookingStatus(@Param('id') id: string, @Body() data: { status: string; reason?: string }) {
    return this.bookingService.updateBookingStatus(id, data.status, data.reason);
  }

  // ─── Waiting List ────────────────────────────

  @Post('tenants/:tenantId/booking/waiting-list')
  @ApiOperation({ summary: 'Add to waiting list' })
  addToWaitingList(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.bookingService.addToWaitingList(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tenants/:tenantId/booking/waiting-list')
  @ApiOperation({ summary: 'Get waiting list' })
  @ApiQuery({ name: 'serviceId', required: false })
  getWaitingList(@Param('tenantId') tenantId: string, @Query('serviceId') serviceId?: string) {
    return this.bookingService.getWaitingList(tenantId, serviceId);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('booking/waiting-list/:id/notify')
  @ApiOperation({ summary: 'Mark waiting list entry as notified' })
  markNotified(@Param('id') id: string) {
    return this.bookingService.markNotified(id);
  }

  // ─── Calendar / Timeline ─────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tenants/:tenantId/booking/calendar')
  @ApiOperation({ summary: 'Get booking timeline for a date range' })
  @ApiQuery({ name: 'from', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: true, description: 'YYYY-MM-DD' })
  getCalendar(
    @Param('tenantId') tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.bookingService.getBookings(tenantId, {
      date: from,
      limit: '100',
    });
  }
}
