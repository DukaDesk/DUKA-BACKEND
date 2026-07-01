import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../../shared/events/event-bus.service';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  // ─── Services ────────────────────────────────

  async createService(tenantId: string, data: any) {
    return this.prisma.bookingService.create({ data: { tenantId, ...data } });
  }

  async getServices(tenantId: string) {
    return this.prisma.bookingService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async getService(serviceId: string) {
    const s = await this.prisma.bookingService.findUnique({
      where: { id: serviceId },
      include: { staff: true },
    });
    if (!s) throw new NotFoundException('Service not found');
    return s;
  }

  async updateService(serviceId: string, data: any) {
    const s = await this.prisma.bookingService.findUnique({ where: { id: serviceId } });
    if (!s) throw new NotFoundException('Service not found');
    return this.prisma.bookingService.update({ where: { id: serviceId }, data });
  }

  async deleteService(serviceId: string) {
    await this.prisma.bookingService.update({ where: { id: serviceId }, data: { isActive: false } });
    return { message: 'Service deleted' };
  }

  // ─── Staff ───────────────────────────────────

  async createStaff(tenantId: string, data: any) {
    return this.prisma.staffMember.create({
      data: {
        tenantId,
        name: data.name,
        role: data.role,
        workingHours: data.workingHours || null,
        bufferTime: data.bufferTime || 15,
        bookingLimit: data.bookingLimit || null,
        services: data.serviceIds
          ? { connect: data.serviceIds.map((id: string) => ({ id })) }
          : undefined,
      },
      include: { services: true },
    });
  }

  async getStaff(tenantId: string) {
    return this.prisma.staffMember.findMany({
      where: { tenantId, isActive: true },
      include: { services: true },
      orderBy: { name: 'asc' },
    });
  }

  async getStaffMember(staffId: string) {
    const s = await this.prisma.staffMember.findUnique({
      where: { id: staffId },
      include: { services: true },
    });
    if (!s) throw new NotFoundException('Staff member not found');
    return s;
  }

  async updateStaff(staffId: string, data: any) {
    const { serviceIds, ...rest } = data;
    const updateData: any = { ...rest };
    if (serviceIds) {
      updateData.services = { set: serviceIds.map((id: string) => ({ id })) };
    }
    const s = await this.prisma.staffMember.findUnique({ where: { id: staffId } });
    if (!s) throw new NotFoundException('Staff member not found');
    return this.prisma.staffMember.update({ where: { id: staffId }, data: updateData, include: { services: true } });
  }

  async deleteStaff(staffId: string) {
    await this.prisma.staffMember.update({ where: { id: staffId }, data: { isActive: false } });
    return { message: 'Staff member deleted' };
  }

  // ─── Resources ───────────────────────────────

  async createResource(tenantId: string, data: any) {
    return this.prisma.bookingResource.create({ data: { tenantId, ...data } });
  }

  async getResources(tenantId: string) {
    return this.prisma.bookingResource.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateResource(resourceId: string, data: any) {
    const r = await this.prisma.bookingResource.findUnique({ where: { id: resourceId } });
    if (!r) throw new NotFoundException('Resource not found');
    return this.prisma.bookingResource.update({ where: { id: resourceId }, data });
  }

  async deleteResource(resourceId: string) {
    await this.prisma.bookingResource.update({ where: { id: resourceId }, data: { isActive: false } });
    return { message: 'Resource deleted' };
  }

  // ─── Schedules ───────────────────────────────

  async createSchedule(tenantId: string, data: any) {
    return this.prisma.schedule.create({ data: { tenantId, ...data } });
  }

  async getSchedules(tenantId: string, staffId?: string, resourceId?: string) {
    return this.prisma.schedule.findMany({
      where: { tenantId, isActive: true, ...(staffId ? { staffId } : {}), ...(resourceId ? { resourceId } : {}) },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async updateSchedule(scheduleId: string, data: any) {
    const s = await this.prisma.schedule.findUnique({ where: { id: scheduleId } });
    if (!s) throw new NotFoundException('Schedule not found');
    return this.prisma.schedule.update({ where: { id: scheduleId }, data });
  }

  async deleteSchedule(scheduleId: string) {
    await this.prisma.schedule.update({ where: { id: scheduleId }, data: { isActive: false } });
    return { message: 'Schedule deleted' };
  }

  // ─── Availability Engine ─────────────────────

  async getAvailableSlots(tenantId: string, serviceId: string, date: string, staffId?: string) {
    const service = await this.prisma.bookingService.findUnique({ where: { id: serviceId } });
    if (!service) throw new NotFoundException('Service not found');

    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    const schedules = await this.prisma.schedule.findMany({
      where: {
        tenantId,
        isActive: true,
        staffId: staffId || undefined,
        OR: [
          { isRecurring: true, dayOfWeek },
          { isRecurring: false, date: targetDate },
        ],
      },
    });

    if (schedules.length === 0) return [];

    const existingBookings = await this.prisma.booking.findMany({
      where: {
        tenantId,
        serviceId,
        staffId: staffId || undefined,
        status: { notIn: ['cancelled', 'no_show'] },
        startTime: { gte: new Date(targetDate.setHours(0, 0, 0, 0)) },
        endTime: { lte: new Date(new Date(date).setHours(23, 59, 59, 999)) },
      },
    });

    const slots: { startTime: string; endTime: string; staffId?: string; available: boolean }[] = [];

    for (const schedule of schedules) {
      const [startH, startM] = schedule.startTime.split(':').map(Number);
      const [endH, endM] = schedule.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const duration = service.duration;

      for (let m = startMinutes; m + duration <= endMinutes; m += duration + (schedule.staffId ? 0 : 0)) {
        const slotStart = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const slotEnd = `${String(Math.floor((m + duration) / 60)).padStart(2, '0')}:${String((m + duration) % 60).padStart(2, '0')}`;

        const slotStartDate = new Date(date);
        slotStartDate.setHours(Math.floor(m / 60), m % 60, 0, 0);
        const slotEndDate = new Date(date);
        slotEndDate.setHours(Math.floor((m + duration) / 60), (m + duration) % 60, 0, 0);

        const conflict = existingBookings.some((b) => slotStartDate < b.endTime && slotEndDate > b.startTime);
        const bookingCount = existingBookings.filter((b) => slotStartDate < b.endTime && slotEndDate > b.startTime).length;

        slots.push({
          startTime: slotStart,
          endTime: slotEnd,
          staffId: schedule.staffId || undefined,
          available: !conflict && bookingCount < service.capacity,
        });
      }
    }

    return slots;
  }

  // ─── Bookings ────────────────────────────────

  async createBooking(tenantId: string, data: any) {
    const { serviceId, staffId, resourceId, startTime, customerName, customerEmail, customerPhone, notes } = data;
    const startDate = new Date(startTime);

    const service = await this.prisma.bookingService.findUnique({ where: { id: serviceId } });
    if (!service) throw new NotFoundException('Service not found');

    const endDate = new Date(startDate.getTime() + service.duration * 60000);

    const existing = await this.prisma.booking.findMany({
      where: {
        tenantId,
        serviceId,
        staffId: staffId || undefined,
        status: { notIn: ['cancelled', 'no_show'] },
        startTime: { lt: endDate },
        endTime: { gt: startDate },
      },
    });

    if (existing.length >= service.capacity) {
      throw new BadRequestException('No availability for this time slot');
    }

    const booking = await this.prisma.booking.create({
      data: {
        tenantId,
        serviceId,
        staffId,
        resourceId,
        customerName,
        customerEmail,
        customerPhone,
        startTime: startDate,
        endTime: endDate,
        notes,
        status: 'requested',
        bookingHistory: {
          create: { to: 'requested' },
        },
      },
      include: { service: true, staff: true },
    });

    await this.eventBus.publish({
      type: 'BookingCreated',
      aggregateId: booking.id,
      data: { bookingId: booking.id, tenantId, serviceId, startTime, customerEmail },
    });

    this.logger.log(`Booking ${booking.id} created for ${customerName}`);
    return booking;
  }

  async getBookings(tenantId: string, query: any) {
    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.serviceId) where.serviceId = query.serviceId;
    if (query.staffId) where.staffId = query.staffId;
    if (query.date) {
      const d = new Date(query.date);
      where.startTime = { gte: new Date(d.setHours(0, 0, 0, 0)), lte: new Date(d.setHours(23, 59, 59, 999)) };
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: { service: true, staff: true, resource: true },
        skip,
        take: limit,
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true, staff: true, resource: true, bookingHistory: { orderBy: { createdAt: 'asc' } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async updateBookingStatus(bookingId: string, status: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    const validTransitions: Record<string, string[]> = {
      requested: ['confirmed', 'cancelled'],
      confirmed: ['in_progress', 'cancelled', 'rescheduled'],
      in_progress: ['completed', 'no_show'],
      completed: [],
      cancelled: [],
      no_show: [],
      rescheduled: ['confirmed', 'cancelled'],
    };

    const allowed = validTransitions[booking.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot transition from ${booking.status} to ${status}`);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status,
        bookingHistory: {
          create: { from: booking.status, to: status, reason },
        },
      },
      include: { bookingHistory: { orderBy: { createdAt: 'asc' } } },
    });

    await this.eventBus.publish({
      type: 'BookingStatusChanged',
      aggregateId: bookingId,
      data: { bookingId, from: booking.status, to: status },
    });

    return updated;
  }

  // ─── Waiting List ────────────────────────────

  async addToWaitingList(tenantId: string, data: any) {
    return this.prisma.waitingListEntry.create({ data: { tenantId, ...data } });
  }

  async getWaitingList(tenantId: string, serviceId?: string) {
    return this.prisma.waitingListEntry.findMany({
      where: { tenantId, notified: false, ...(serviceId ? { serviceId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markNotified(entryId: string) {
    return this.prisma.waitingListEntry.update({ where: { id: entryId }, data: { notified: true } });
  }
}
