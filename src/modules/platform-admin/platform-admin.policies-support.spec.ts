import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';

function makePrisma() {
  const prisma: any = {
    platformPolicy: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    supportTicket: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    supportTicketEvent: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  return prisma;
}

describe('PlatformAdminService policies', () => {
  it('clamps pagination and applies only allow-listed policy filters', async () => {
    const prisma = makePrisma();
    prisma.platformPolicy.findMany.mockResolvedValue([]);
    prisma.platformPolicy.count.mockResolvedValue(3);
    const service = new PlatformAdminService(prisma as never);

    const result = await service.getPolicies(0, 1000, { status: 'bogus', search: '  data  ' });

    const where = {
      OR: [
        { key: { contains: 'data', mode: 'insensitive' } },
        { title: { contains: 'data', mode: 'insensitive' } },
        { body: { contains: 'data', mode: 'insensitive' } },
      ],
    };
    expect(prisma.platformPolicy.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: 0,
      take: 100,
    });
    expect(result).toEqual({ data: [], total: 3, page: 1, limit: 100, totalPages: 1 });
  });

  it('rejects incomplete or duplicate policy creation before writing', async () => {
    const prisma = makePrisma();
    const service = new PlatformAdminService(prisma as never);

    await expect(service.createPolicy('a1', { key: '', title: 't', body: 'b' }))
      .rejects.toBeInstanceOf(BadRequestException);

    prisma.platformPolicy.findUnique.mockResolvedValue({ id: 'p1', key: 'terms' });
    await expect(service.createPolicy('a1', { key: 'Terms', title: 'T', body: 'B' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.platformPolicy.create).not.toHaveBeenCalled();
  });

  it('creates a normalized draft policy and writes an audit event', async () => {
    const prisma = makePrisma();
    prisma.platformPolicy.findUnique.mockResolvedValue(null);
    prisma.platformPolicy.create.mockResolvedValue({ id: 'p1', key: 'terms-of-service', status: 'draft' });
    prisma.auditLog.create.mockResolvedValue({});
    const service = new PlatformAdminService(prisma as never);

    const policy = await service.createPolicy('admin-1', { key: 'Terms Of Service!', title: 'TOS', body: 'Body' });

    expect(prisma.platformPolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ key: 'terms-of-service', title: 'TOS', body: 'Body', category: 'general', createdBy: 'admin-1' }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'policy.create', entity: 'platform_policy', entityId: 'p1', userId: 'admin-1' }),
    });
    expect(policy).toMatchObject({ id: 'p1', status: 'draft' });
  });

  it('refuses to edit a published policy and to publish a non-review policy', async () => {
    const prisma = makePrisma();
    const service = new PlatformAdminService(prisma as never);

    prisma.platformPolicy.findUnique.mockResolvedValue({ id: 'p1', status: 'published' });
    await expect(service.updatePolicy('p1', 'a1', { title: 'New' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.publishPolicy('p1', 'a1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.platformPolicy.update).not.toHaveBeenCalled();
  });

  it('publishes an in-review policy with publisher metadata', async () => {
    const prisma = makePrisma();
    prisma.platformPolicy.findUnique.mockResolvedValue({ id: 'p1', status: 'in_review', version: 2 });
    prisma.platformPolicy.update.mockResolvedValue({ id: 'p1', status: 'published', version: 2 });
    const service = new PlatformAdminService(prisma as never);

    const updated = await service.publishPolicy('p1', 'super-1');

    expect(prisma.platformPolicy.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ status: 'published', publishedBy: 'super-1' }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'policy.publish', entityId: 'p1' }),
    });
    expect(updated.status).toBe('published');
  });

  it('only archives a published policy', async () => {
    const prisma = makePrisma();
    const service = new PlatformAdminService(prisma as never);

    prisma.platformPolicy.findUnique.mockResolvedValue({ id: 'p1', status: 'draft' });
    await expect(service.archivePolicy('p1', 'a1')).rejects.toBeInstanceOf(BadRequestException);

    prisma.platformPolicy.update.mockResolvedValue({ id: 'p1', status: 'archived' });
    prisma.platformPolicy.findUnique.mockResolvedValue({ id: 'p1', status: 'published' });
    const archived = await service.archivePolicy('p1', 'a1');
    expect(archived.status).toBe('archived');
  });

  it('throws NotFound for an unknown policy', async () => {
    const prisma = makePrisma();
    prisma.platformPolicy.findUnique.mockResolvedValue(null);
    const service = new PlatformAdminService(prisma as never);
    await expect(service.submitPolicy('missing', 'a1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PlatformAdminService support tickets', () => {  it('validates, classifies, and event-logs ticket creation', async () => {
    const prisma = makePrisma();
    const service = new PlatformAdminService(prisma as never);

    await expect(service.createSupportTicket('a1', { subject: '', description: 'x' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createSupportTicket('a1', { subject: 's', description: 'd', priority: 'nuclear' }))
      .rejects.toBeInstanceOf(BadRequestException);

    prisma.supportTicket.create.mockResolvedValue({ id: 't1', status: 'open', tenantId: 'ten-1' });
    prisma.supportTicketEvent.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    const ticket = await service.createSupportTicket('a1', { subject: 'Help', description: 'Issue', priority: 'URGENT', tenantId: 'ten-1' });

    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ subject: 'Help', priority: 'urgent', status: 'open', createdBy: 'a1' }),
    });
    expect(prisma.supportTicketEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticketId: 't1', type: 'created', actorId: 'a1' }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'support.ticket_create', entityId: 't1' }),
    });
    expect(ticket.id).toBe('t1');
  });

  it('marks a ticket in progress when created with an assignee', async () => {
    const prisma = makePrisma();
    prisma.supportTicket.create.mockResolvedValue({ id: 't2', status: 'in_progress' });
    prisma.supportTicketEvent.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
    const service = new PlatformAdminService(prisma as never);

    await service.createSupportTicket('a1', { subject: 's', description: 'd', assigneeId: 'agent-9' });
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assigneeId: 'agent-9', status: 'in_progress' }),
    });
  });

  it('filters tickets by allow-listed status/priority/assignee and search', async () => {
    const prisma = makePrisma();
    prisma.supportTicket.findMany.mockResolvedValue([]);
    prisma.supportTicket.count.mockResolvedValue(0);
    const service = new PlatformAdminService(prisma as never);

    await service.listSupportTickets(1, 20, { status: 'bogus', priority: 'urgent', assigneeId: '  agent-1 ', search: ' login ' });

    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith({
      where: {
        priority: 'urgent',
        assigneeId: 'agent-1',
        OR: [
          { subject: { contains: 'login', mode: 'insensitive' } },
          { description: { contains: 'login', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: 0,
      take: 20,
    });
  });

  it('requires an assigneeId to assign and a resolution to resolve', async () => {
    const prisma = makePrisma();
    prisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', status: 'open', tenantId: null });
    const service = new PlatformAdminService(prisma as never);

    await expect(service.assignSupportTicket('t1', 'a1', '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resolveSupportTicket('t1', 'a1', '  ')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('blocks escalation of resolved tickets', async () => {
    const prisma = makePrisma();
    prisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', status: 'resolved' });
    const service = new PlatformAdminService(prisma as never);
    await expect(service.escalateSupportTicket('t1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('resolves a ticket and records the resolution event', async () => {
    const prisma = makePrisma();
    prisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', status: 'in_progress', tenantId: 'ten-1' });
    prisma.supportTicket.update.mockResolvedValue({ id: 't1', status: 'resolved' });
    prisma.supportTicketEvent.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
    const service = new PlatformAdminService(prisma as never);

    const result = await service.resolveSupportTicket('t1', 'a1', 'Fixed');

    expect(prisma.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ status: 'resolved', resolution: 'Fixed' }),
    });
    expect(prisma.supportTicketEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ticketId: 't1', type: 'resolved', message: 'Fixed' }),
    });
    expect(result.status).toBe('resolved');
  });

  it('throws NotFound when the ticket does not exist', async () => {
    const prisma = makePrisma();
    prisma.supportTicket.findUnique.mockResolvedValue(null);
    const service = new PlatformAdminService(prisma as never);
    await expect(service.commentSupportTicket('none', 'a1', 'hi')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PlatformAdminService report exports', () => {
  it('rejects unsupported report keys', async () => {
    const prisma = makePrisma();
    const service = new PlatformAdminService(prisma as never);
    await expect(service.exportReport('secrets', {}, 'a1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('exports support tickets as escaped CSV and writes an audit event', async () => {
    const prisma = makePrisma();
    prisma.supportTicket.findMany.mockResolvedValue([
      { id: 't1', subject: '=cmd|calc', status: 'open', priority: 'high', category: 'general', assigneeId: null, tenantId: null, createdAt: new Date('2026-01-01T00:00:00Z'), resolvedAt: null },
    ]);
    prisma.supportTicket.count.mockResolvedValue(1);
    prisma.auditLog.create.mockResolvedValue({});
    const service = new PlatformAdminService(prisma as never);

    const result = await service.exportReport('support-tickets', {}, 'a1');

    expect(result.report).toBe('support-tickets');
    expect(result.rows).toBe(1);
    expect(result.csv).toContain('"Ticket ID"');
    expect(result.csv).toContain("'=cmd|calc");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'report.export', entityId: 'support-tickets', userId: 'a1' }),
    });
  });

  it('paginates through all report rows up to the cap', async () => {
    const prisma = makePrisma();
    prisma.supportTicket.count.mockResolvedValue(150);
    prisma.supportTicket.findMany
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, subject: 's', status: 'open', priority: 'low', category: 'g' })))
      .mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => ({ id: `t${100 + i}`, subject: 's', status: 'open', priority: 'low', category: 'g' })));
    prisma.auditLog.create.mockResolvedValue({});
    const service = new PlatformAdminService(prisma as never);

    const result = await service.exportReport('support-tickets', {}, 'a1');

    expect(prisma.supportTicket.findMany).toHaveBeenCalledTimes(2);
    expect(result.rows).toBe(150);
    expect(result.csv.split('\r\n')).toHaveLength(151);
  });
});
