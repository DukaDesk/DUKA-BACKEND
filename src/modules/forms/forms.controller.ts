import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FormsService } from './forms.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Forms')
@Controller({ version: '1' })
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  // ─── Form CRUD ───────────────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('tenants/:tenantId/forms')
  @ApiOperation({ summary: 'Create form with fields' })
  createForm(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.formsService.createForm(tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('tenants/:tenantId/forms')
  @ApiOperation({ summary: 'List forms' })
  getForms(@Param('tenantId') tenantId: string) {
    return this.formsService.getForms(tenantId);
  }

  @Public()
  @Get('forms/:id')
  @ApiOperation({ summary: 'Get form with fields and workflow' })
  getForm(@Param('id') id: string) {
    return this.formsService.getForm(id);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Put('forms/:id')
  @ApiOperation({ summary: 'Update form (auto-increments version)' })
  updateForm(@Param('id') id: string, @Body() data: any) {
    return this.formsService.updateForm(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Delete('forms/:id')
  @ApiOperation({ summary: 'Delete form' })
  deleteForm(@Param('id') id: string) {
    return this.formsService.deleteForm(id);
  }

  // ─── Submissions ─────────────────────────────

  @Public()
  @Post('forms/:id/submit')
  @ApiOperation({ summary: 'Submit form answers (public)' })
  submitForm(@Param('id') id: string, @Body() data: { tenantId: string; answers: any; userId?: string; attachments?: string[] }) {
    return this.formsService.submitForm(id, data.tenantId, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('forms/:id/submissions')
  @ApiOperation({ summary: 'List submissions for a form' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getSubmissions(@Param('id') id: string, @Query() query: any) {
    return this.formsService.getSubmissions(id, query);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Get('submissions/:id')
  @ApiOperation({ summary: 'Get submission detail' })
  getSubmission(@Param('id') id: string) {
    return this.formsService.getSubmission(id);
  }

  // ─── Workflow / Approval ─────────────────────

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('forms/:id/workflow')
  @ApiOperation({ summary: 'Set approval workflow steps' })
  setWorkflow(@Param('id') id: string, @Body() data: { steps: any }) {
    return this.formsService.setWorkflow(id, data);
  }

  @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @Post('submissions/:id/approve')
  @ApiOperation({ summary: 'Approve or reject a submission' })
  approveSubmission(@Param('id') id: string, @Body() data: { approverId?: string; action: 'approved' | 'rejected'; comment?: string }) {
    return this.formsService.approveSubmission(id, data);
  }
}
