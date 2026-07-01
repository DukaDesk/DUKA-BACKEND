import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../../shared/events/event-bus.service';

@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  // ─── Form CRUD ───────────────────────────────

  async createForm(tenantId: string, data: any) {
    const { fields, sections, config, ...formData } = data;
    return this.prisma.form.create({
      data: {
        tenantId,
        ...formData,
        sections: sections || null,
        config: config || null,
        fields: fields
          ? { create: fields.map((f: any, i: number) => ({ ...f, sortOrder: f.sortOrder ?? i })) }
          : undefined,
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async getForms(tenantId: string) {
    return this.prisma.form.findMany({
      where: { tenantId },
      include: { _count: { select: { fields: true, submissions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForm(formId: string) {
    const form = await this.prisma.form.findUnique({
      where: { id: formId },
      include: {
        fields: { orderBy: { sortOrder: 'asc' } },
        workflows: true,
      },
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async updateForm(formId: string, data: any) {
    const form = await this.prisma.form.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException('Form not found');

    const { fields, sections, config, ...formData } = data;
    const updateData: any = { ...formData, version: { increment: 1 } };
    if (sections) updateData.sections = sections;
    if (config) updateData.config = config;

    if (fields) {
      await this.prisma.formField.deleteMany({ where: { formId } });
      await this.prisma.formField.createMany({
        data: fields.map((f: any, i: number) => ({ formId, ...f, sortOrder: f.sortOrder ?? i })),
      });
    }

    return this.prisma.form.update({
      where: { id: formId },
      data: updateData,
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async deleteForm(formId: string) {
    const form = await this.prisma.form.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException('Form not found');
    await this.prisma.form.delete({ where: { id: formId } });
    return { message: 'Form deleted' };
  }

  // ─── Submission ──────────────────────────────

  async submitForm(formId: string, tenantId: string, data: { answers: any; userId?: string; attachments?: string[] }) {
    const form = await this.prisma.form.findUnique({
      where: { id: formId },
      include: { fields: true, workflows: true },
    });
    if (!form) throw new NotFoundException('Form not found');

    const errors = this.validateAnswers(form.fields, data.answers);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }

    const workflowState = form.workflows?.[0]?.steps
      ? 'pending_approval'
      : null;

    const submission = await this.prisma.formSubmission.create({
      data: {
        formId,
        tenantId,
        formVersion: form.version,
        userId: data.userId || null,
        answers: data.answers,
        attachments: data.attachments || [],
        status: 'submitted',
        workflowState,
      },
    });

    await this.eventBus.publish({
      type: 'FormSubmitted',
      aggregateId: submission.id,
      data: { formId, submissionId: submission.id, tenantId },
    });

    this.logger.log(`Submission ${submission.id} for form ${formId}`);
    return submission;
  }

  async getSubmissions(formId: string, query: any) {
    const where: any = { formId };
    if (query.status) where.status = query.status;

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.formSubmission.findMany({
        where,
        include: { approvals: { orderBy: { actedAt: 'desc' } } },
        skip,
        take: limit,
        orderBy: { submittedAt: 'desc' },
      }),
      this.prisma.formSubmission.count({ where }),
    ]);

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getSubmission(submissionId: string) {
    const sub = await this.prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: { form: true, approvals: { orderBy: { actedAt: 'asc' } } },
    });
    if (!sub) throw new NotFoundException('Submission not found');
    return sub;
  }

  // ─── Workflow / Approval ─────────────────────

  async setWorkflow(formId: string, data: { steps: any }) {
    return this.prisma.formWorkflow.upsert({
      where: { formId },
      create: { formId, steps: data.steps },
      update: { steps: data.steps },
    });
  }

  async approveSubmission(submissionId: string, data: { approverId?: string; action: string; comment?: string }) {
    const submission = await this.prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: { form: { include: { workflows: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const approval = await this.prisma.formApproval.create({
      data: {
        submissionId,
        approverId: data.approverId,
        action: data.action,
        comment: data.comment,
      },
    });

    const workflow = submission.form.workflows[0];
    const allApprovals = await this.prisma.formApproval.findMany({ where: { submissionId } });

    let newStatus = submission.status;
    if (data.action === 'approved') {
      const requiredSteps = (workflow?.steps as any[])?.length || 1;
      const approvalsCount = allApprovals.filter((a) => a.action === 'approved').length;
      newStatus = approvalsCount >= requiredSteps ? 'approved' : submission.workflowState || 'pending_approval';
    } else if (data.action === 'rejected') {
      newStatus = 'rejected';
    }

    if (newStatus !== submission.status) {
      await this.prisma.formSubmission.update({
        where: { id: submissionId },
        data: { status: newStatus, workflowState: newStatus === 'approved' ? null : submission.workflowState },
      });
    }

    await this.eventBus.publish({
      type: 'SubmissionApproved',
      aggregateId: submissionId,
      data: { submissionId, action: data.action, newStatus },
    });

    return approval;
  }

  // ─── Validation Engine ───────────────────────

  private validateAnswers(fields: any[], answers: any): { field: string; message: string }[] {
    const errors: { field: string; message: string }[] = [];
    for (const field of fields) {
      const value = answers?.[field.id];
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push({ field: field.id, message: `${field.label} is required` });
        continue;
      }
      if (value === undefined || value === null) continue;

      const validation = field.validation as any;
      if (!validation) continue;

      if (validation.minLength && typeof value === 'string' && value.length < validation.minLength) {
        errors.push({ field: field.id, message: `Minimum ${validation.minLength} characters` });
      }
      if (validation.maxLength && typeof value === 'string' && value.length > validation.maxLength) {
        errors.push({ field: field.id, message: `Maximum ${validation.maxLength} characters` });
      }
      if (validation.min && typeof value === 'number' && value < validation.min) {
        errors.push({ field: field.id, message: `Minimum value is ${validation.min}` });
      }
      if (validation.max && typeof value === 'number' && value > validation.max) {
        errors.push({ field: field.id, message: `Maximum value is ${validation.max}` });
      }
      if (validation.pattern && typeof value === 'string' && !new RegExp(validation.pattern).test(value)) {
        errors.push({ field: field.id, message: validation.patternMessage || 'Invalid format' });
      }
      if (field.type === 'email' && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push({ field: field.id, message: 'Invalid email address' });
      }
    }
    return errors;
  }
}
