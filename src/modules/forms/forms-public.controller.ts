import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FormsService } from './forms.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Forms - Public (Consumer-Facing)')
@Controller({ path: 'merchants/:merchantId/forms', version: '1' })
export class FormsPublicController {
  constructor(private readonly formsService: FormsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List forms for a merchant' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getForms(@Param('merchantId') merchantId: string, @Query() query: any) {
    return this.formsService.getForms(merchantId);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get form with fields and workflow' })
  getForm(@Param('id') id: string) {
    return this.formsService.getForm(id);
  }

  @Public()
  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit form answers (public)' })
  submitForm(@Param('merchantId') merchantId: string, @Param('id') id: string, @Body() data: { answers: any; userId?: string; attachments?: string[] }) {
    return this.formsService.submitForm(id, merchantId, data);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/submissions')
  @ApiOperation({ summary: 'List submissions for a form' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getSubmissions(@Param('id') id: string, @Query() query: any) {
    return this.formsService.getSubmissions(id, query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('submissions/:id')
  @ApiOperation({ summary: 'Get submission detail' })
  getSubmission(@Param('id') id: string) {
    return this.formsService.getSubmission(id);
  }
}