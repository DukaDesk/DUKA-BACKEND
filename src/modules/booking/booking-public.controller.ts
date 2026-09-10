import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Booking - Public (Consumer-Facing)')
@Controller({ version: '1' })
export class BookingPublicController {
  constructor(private readonly bookingService: BookingService) {}

  // ─── Services ────────────────────────────────

  @Public()
  @Get('merchants/:merchantId/booking/services')
  @ApiOperation({ summary: 'List booking services (public)' })
  getServices(@Param('merchantId') merchantId: string) {
    return this.bookingService.getServices(merchantId);
  }

  @Public()
  @Get('booking/services/:id')
  @ApiOperation({ summary: 'Get booking service with assigned staff (public)' })
  getService(@Param('id') id: string) {
    return this.bookingService.getService(id);
  }

  // ─── Locations ────────────────────────────────

  @Public()
  @Get('merchants/:merchantId/booking/locations')
  @ApiOperation({ summary: 'List booking locations (public)' })
  getLocations(@Param('merchantId') merchantId: string) {
    return this.bookingService.getLocations(merchantId);
  }

  // ─── Staff ────────────────────────────────────

  @Public()
  @Get('merchants/:merchantId/booking/staff')
  @ApiOperation({ summary: 'List staff members (public)' })
  getStaff(@Param('merchantId') merchantId: string) {
    return this.bookingService.getStaff(merchantId);
  }

  @Public()
  @Get('booking/staff/:id')
  @ApiOperation({ summary: 'Get staff member (public)' })
  getStaffMember(@Param('id') id: string) {
    return this.bookingService.getStaffMember(id);
  }

  // ─── Resources ────────────────────────────────

  @Public()
  @Get('merchants/:merchantId/booking/resources')
  @ApiOperation({ summary: 'List resources (public)' })
  getResources(@Param('merchantId') merchantId: string) {
    return this.bookingService.getResources(merchantId);
  }

  // ─── Schedules ────────────────────────────────

  @Public()
  @Get('merchants/:merchantId/booking/schedules')
  @ApiOperation({ summary: 'List schedules (public)' })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'resourceId', required: false })
  getSchedules(
    @Param('merchantId') merchantId: string,
    @Query('staffId') staffId?: string,
    @Query('resourceId') resourceId?: string,
  ) {
    return this.bookingService.getSchedules(merchantId, staffId, resourceId);
  }

  // ─── Availability ────────────────────────────

  @Public()
  @Get('merchants/:merchantId/booking/availability')
  @ApiOperation({ summary: 'Get available time slots (public)' })
  @ApiQuery({ name: 'serviceId', required: true })
  @ApiQuery({ name: 'date', required: true, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'staffId', required: false })
  getAvailableSlots(
    @Param('merchantId') merchantId: string,
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.bookingService.getAvailableSlots(merchantId, serviceId, date, staffId);
  }

  // ─── Bookings (Public Create) ─────────────────

  @Post('merchants/:merchantId/booking')
  @ApiOperation({ summary: 'Create booking (public)' })
  createBooking(@Param('merchantId') merchantId: string, @Body() data: any) {
    return this.bookingService.createBooking(merchantId, data);
  }

  // ─── Waiting List ────────────────────────────

  @Post('merchants/:merchantId/booking/waiting-list')
  @ApiOperation({ summary: 'Add to waiting list (public)' })
  addToWaitingList(@Param('merchantId') merchantId: string, @Body() data: any) {
    return this.bookingService.addToWaitingList(merchantId, data);
  }
}