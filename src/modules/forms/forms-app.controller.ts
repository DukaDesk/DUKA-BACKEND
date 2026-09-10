import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FormsService } from './forms.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Forms - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/forms', version: '1' })
export class FormsAppController {
  constructor(
    private readonly formsService: FormsService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  // ─── Form CRUD ───────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create form with fields for current tenant' })
  async createForm(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.formsService.createForm(tenantId, data);
  }

  @Get()
  @ApiOperation({ summary: 'List forms for current tenant' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getForms(@CurrentUser('id') userId: string, @Query() query: any) {
    const tenantId = await this.getTenantId(userId);
    return this.formsService.getForms(tenantId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update form (auto-increments version)' })
  async updateForm(@Param('id') id: string, @Body() data: any) {
    return this.formsService.updateForm(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete form' })
  async deleteForm(@Param('id') id: string) {
    return this.formsService.deleteForm(id);
  }

  // ─── Submissions ─────────────────────────────

  @Get(':id/submissions')
  @ApiOperation({ summary: 'List submissions for a form in current tenant' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getSubmissions(@Param('id') id: string, @Query() query: any) {
    return this.formsService.getSubmissions(id, query);
  }

  @Get('submissions/:id')
  @ApiOperation({ summary: 'Get submission detail' })
  async getSubmission(@Param('id') id: string) {
    return this.formsService.getSubmission(id);
  }

  // ─── Workflow / Approval ─────────────────────

  @Post(':id/workflow')
  @ApiOperation({ summary: 'Set approval workflow steps for current tenant form' })
  async setWorkflow(@Param('id') id: string, @Body() data: { steps: any }) {
    return this.formsService.setWorkflow(id, data);
  }

  @Post('submissions/:id/approve')
  @ApiOperation({ summary: 'Approve or reject a submission' })
  async approveSubmission(@Param('id') id: string, @Body() data: { approverId?: string; action: 'approved' | 'rejected'; comment?: string }) {
    return this.formsService.approveSubmission(id, data);
  }
}